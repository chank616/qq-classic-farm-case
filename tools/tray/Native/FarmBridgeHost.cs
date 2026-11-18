using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json.Nodes;
using static FarmTray.Native.JsonData;

namespace FarmTray.Native;

// A loopback-only HTTP server using TcpListener, without URL ACL/admin setup,
// ASP.NET runtime, Node.js, or a child service process.
internal sealed class FarmBridgeHost : IDisposable
{
    private readonly TcpListener _listener;
    private readonly CancellationTokenSource _stop = new();
    private readonly ConcurrentQueue<JsonObject> _cryptoJobs = new(), _bridgeJobs = new();
    private readonly ConcurrentDictionary<string, TaskCompletionSource<JsonObject>> _waiters = new();
    private readonly string _light = FarmPaths.Resource("qq-light.js"), _tsdk = FarmPaths.Resource("qq-tsdk.js");
    private string _code;
    private string _hostId = "";
    private readonly string _session = Guid.NewGuid().ToString("N");
    private readonly object _hostGate = new();
    private long _codeAt, _hostAt, _sequence;
    private readonly ConcurrentDictionary<string, long> _requests = new();
    private string _lastError = "";
    private static readonly object LogGate = new();
    internal int Port => ((IPEndPoint)_listener.LocalEndpoint).Port;
    internal FarmBridgeHost(int port = 17841)
    {
        _listener = new TcpListener(IPAddress.Loopback, port); _listener.Start(); _ = Listen();
    }
    internal static async Task<FarmBridgeHost> Ensure()
    {
        try { return new FarmBridgeHost(); }
        catch (SocketException e) when (e.SocketErrorCode == SocketError.AddressAlreadyInUse) {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            var health = JsonNode.Parse(await http.GetStringAsync("http://127.0.0.1:17841/health"));
            if (S(health, "runtime") == "csharp") return null;
            throw new IOException("本地端口 17841 被其他服务占用，请退出旧版农场服务后再启动 C# 版。");
        }
    }
    internal static void Log(JsonObject value)
    {
        // Explicit metadata allowlist: credentials, encryption payloads and raw
        // gateway frames never enter the event log.
        var record = O(("t", DateTimeOffset.UtcNow.ToString("O")));
        foreach (var key in new[] { "type", "runId", "mode", "day", "status", "allRequiredComplete", "reportPath", "err", "len", "op",
            "name", "gid", "level", "gold", "exp", "points", "diamonds", "fertHours", "fertOrgHours", "sec", "needSec", "haveSec",
            "lands", "planted", "minMatureAt", "lastGrowAt", "batchMatureAt", "batchFertilizeAt", "total", "runtime", "method", "msg" })
            if (value.ContainsKey(key)) record[key] = Copy(value[key]);
        lock (LogGate) {
            Directory.CreateDirectory(FarmPaths.Artifacts);
            using var file = new FileStream(Path.Combine(FarmPaths.Artifacts, "m0-code-capture.jsonl"), FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
            var bytes = Encoding.UTF8.GetBytes(record.ToJsonString() + "\n"); file.Write(bytes);
        }
    }
    private async Task Listen()
    {
        while (!_stop.IsCancellationRequested) try { var client = await _listener.AcceptTcpClientAsync(_stop.Token); _ = Handle(client); }
        catch (OperationCanceledException) { break; } catch (SocketException) when (_stop.IsCancellationRequested) { break; }
    }
    private async Task<JsonObject> Submit(JsonObject input, bool crypto)
    {
        var id = _session + (crypto ? "c" : "b") + Interlocked.Increment(ref _sequence);
        var waiter = new TaskCompletionSource<JsonObject>(TaskCreationOptions.RunContinuationsAsynchronously);
        _waiters[id] = waiter; input["id"] = id; (crypto ? _cryptoJobs : _bridgeJobs).Enqueue(input);
        try { return await waiter.Task.WaitAsync(TimeSpan.FromSeconds(crypto ? 10 : 15), _stop.Token); }
        catch (TimeoutException) { throw new IOException(crypto ? "QQ crypto timeout" : "QQ protobuf bridge timeout"); }
        finally { _waiters.TryRemove(id, out _); }
    }
    private JsonObject Take(ConcurrentQueue<JsonObject> queue)
    {
        while (queue.TryDequeue(out var job)) if (_waiters.ContainsKey(S(job, "id"))) return job;
        return new();
    }
    private bool IsActive(string hostId) => hostId.Length > 0 && hostId == _hostId && DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - _hostAt < 30000;
    private bool Register(JsonObject body)
    {
        string id = S(body, "hostId");
        if (id.Length is 0 or > 128 || N(body, "version") != 2 || !B(body, "cryptoReady")) return false;
        lock (_hostGate) {
            if (_hostId != id && DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - _hostAt < 30000) return false;
            if (_hostId != id) {
                _code = null; _codeAt = 0;
                foreach (var waiter in _waiters.Values) waiter.TrySetException(new IOException("QQ farm bridge page changed; retry the pass"));
            }
            _hostId = id; Interlocked.Exchange(ref _hostAt, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()); return true;
        }
    }
    private async Task Handle(TcpClient client)
    {
        using (client) using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(_stop.Token)) {
            timeout.CancelAfter(TimeSpan.FromSeconds(25)); var token = timeout.Token;
            var stream = client.GetStream();
            try {
                using var raw = new MemoryStream(); byte[] buffer = new byte[4096]; int headerEnd = -1;
                while (headerEnd < 0) {
                    int n = await stream.ReadAsync(buffer, token); if (n == 0) return; raw.Write(buffer, 0, n);
                    var data = raw.GetBuffer(); int length = (int)raw.Length;
                    for (int i = 0; i + 3 < length; i++) if (data[i] == 13 && data[i + 1] == 10 && data[i + 2] == 13 && data[i + 3] == 10) { headerEnd = i + 4; break; }
                    if (headerEnd < 0 && raw.Length > 16384) return;
                }
                var headers = Encoding.ASCII.GetString(raw.GetBuffer(), 0, headerEnd).Split("\r\n");
                var request = headers[0].Split(' '); if (request.Length < 2) return;
                string method = request[0], path = request[1].Split('?')[0]; int contentLength = 0;
                string worker = new Uri("http://127.0.0.1" + request[1]).Query.TrimStart('?').Split('&')
                    .Where(q => q.StartsWith("hostId=", StringComparison.Ordinal)).Select(q => Uri.UnescapeDataString(q[7..])).FirstOrDefault() ?? "";
                _requests.AddOrUpdate(method + " " + path, 1, (_, n) => n + 1);
                foreach (var h in headers.Skip(1)) if (h.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
                    contentLength = int.Parse(h[15..].Trim(), System.Globalization.CultureInfo.InvariantCulture);
                if (contentLength < 0 || contentLength > 262144) { await Respond(stream, 413, "{}", token); return; }
                while (raw.Length - headerEnd < contentLength) {
                    int n = await stream.ReadAsync(buffer.AsMemory(0, Math.Min(buffer.Length, contentLength - (int)raw.Length + headerEnd)), token);
                    if (n == 0) return; raw.Write(buffer, 0, n);
                }
                var body = contentLength > 0 ? JsonNode.Parse(Encoding.UTF8.GetString(raw.GetBuffer(), headerEnd, contentLength)) as JsonObject ?? new() : new JsonObject();
                JsonObject result = new();
                if (method == "OPTIONS") { await Respond(stream, 204, "", token); return; }
                if (method == "GET") {
                    if (path == "/light.js" || path == "/tsdk-mini.js" || path == "/boot.js") {
                        await Respond(stream, 200, path == "/light.js" ? _light : path == "/tsdk-mini.js" ? _tsdk : "globalThis.__farmClientBundle={};", token, "application/javascript; charset=utf-8"); return;
                    }
                    result = path switch {
                        "/health" => O(("ok", true), ("runtime", "csharp"), ("bridgeVersion", 2), ("pid", Environment.ProcessId), ("hostAt", _hostAt),
                            ("codeAt", _codeAt), ("hostReady", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - _hostAt < 30000), ("hasCode", _code != null && DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - _codeAt < 90000),
                            ("pending", _waiters.Count), ("requests", _requests), ("lastError", _lastError)),
                        "/code" => O(("code", _code), ("at", _codeAt)),
                        "/cmd" => O(("lightHost", true), ("onePass", false), ("renew", false)),
                        "/crypto-task" => IsActive(worker) ? Take(_cryptoJobs) : new(), "/bridge-task" => IsActive(worker) ? Take(_bridgeJobs) : new(), _ => new()
                    };
                } else if (method == "POST") {
                    switch (path) {
                        case "/host-ready":
                            bool active = Register(body);
                            result = O(("active", active), ("needsCode", active && (_code == null || DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - _codeAt >= 60000))); break;
                        case "/code":
                            if (IsActive(S(body, "hostId")) && S(body, "code").Length is > 0 and <= 256) { _code = S(body, "code"); Interlocked.Exchange(ref _codeAt, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()); } break;
                        case "/crypto-task":
                            result = await Submit(O(("op", S(body, "op") == "d" ? "d" : "e"), ("b64", S(body, "b64"))), true); break;
                        case "/bridge":
                            if (S(body, "op") is not ("encode" or "decode" or "inspect") || _waiters.Count >= 32) { await Respond(stream, 400, "{}", token); return; }
                            result = await Submit(body, false); break;
                        case "/bridge-result": case "/crypto-result":
                            if (IsActive(S(body, "hostId")) && _waiters.TryRemove(S(body, "id"), out var waiter)) waiter.TrySetResult(body); break;
                        case "/evt": Log(body); break;
                    }
                }
                await Respond(stream, 200, result.ToJsonString(), token);
            } catch (OperationCanceledException) { }
            catch (Exception e) { _lastError = e.GetType().Name + ": " + (e is IOException ? e.Message : "Local request failed");
                try { await Respond(stream, 500, O(("error", e is IOException ? e.Message : "Local bridge request failed")).ToJsonString(), token); } catch { } }
        }
    }
    private static async Task Respond(NetworkStream stream, int code, string text, CancellationToken token, string type = "application/json; charset=utf-8")
    {
        var body = Encoding.UTF8.GetBytes(text);
        var header = Encoding.ASCII.GetBytes($"HTTP/1.1 {code} Result\r\nContent-Type: {type}\r\nContent-Length: {body.Length}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nCache-Control: no-store\r\n\r\n");
        await stream.WriteAsync(header, token); await stream.WriteAsync(body, token);
    }
    public void Dispose() { _stop.Cancel(); _listener.Stop(); foreach (var w in _waiters.Values) w.TrySetCanceled(); _code = null; }
}
