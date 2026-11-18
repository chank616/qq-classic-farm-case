using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text.Json.Nodes;
using static FarmTray.Native.JsonData;

namespace FarmTray.Native;

internal delegate Task<JsonObject> FarmRpc(string service, string method, JsonObject request);

internal sealed class FarmTransport : IAsyncDisposable
{
    internal const string Version = "1.15.0.2_20261001";
    private readonly HttpClient _http = new() { BaseAddress = new Uri("http://127.0.0.1:17841"), Timeout = TimeSpan.FromSeconds(20) };
    private readonly ClientWebSocket _socket = new();
    private readonly ConcurrentDictionary<long, TaskCompletionSource<GateProtocol.Frame>> _pending = new();
    private readonly SemaphoreSlim _serial = new(1, 1);
    private readonly CancellationTokenSource _stop;
    private Task _receiver;
    private long _seq;
    private Exception _receiveError;
    internal FarmTransport(CancellationToken token) { _stop = CancellationTokenSource.CreateLinkedTokenSource(token); }
    private async Task<JsonObject> Http(string path, JsonObject value = null)
    {
        using var response = value == null ? await _http.GetAsync(path, _stop.Token) :
            await _http.PostAsync(path, new StringContent(value.ToJsonString(), System.Text.Encoding.UTF8, "application/json"), _stop.Token);
        if (!response.IsSuccessStatusCode) throw new IOException("QQ bridge request failed: " + path + " (" + (int)response.StatusCode + ")");
        var result = JsonNode.Parse(await response.Content.ReadAsStringAsync(_stop.Token)) as JsonObject ?? new();
        if (S(result, "error").Length > 0) throw new IOException(S(result, "error")); return result;
    }
    internal async Task Connect()
    {
        var code = await Http("/code");
        if (S(code, "code").Length == 0 || DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - N(code, "at") > 90000)
            throw new IOException("QQ farm login code is unavailable or stale");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(_stop.Token); timeout.CancelAfter(TimeSpan.FromSeconds(15));
        try { await _socket.ConnectAsync(new Uri("wss://gate-obt.nqf.qq.com/prod/ws?os=Windows&ver=" + Version + "&code=" +
            Uri.EscapeDataString(S(code, "code")) + "&platform=qq"), timeout.Token); }
        catch { throw new IOException("Farm websocket connection failed"); }
        _receiver = Receive();
    }
    private async Task Receive()
    {
        var buffer = new byte[32768];
        try {
            while (!_stop.IsCancellationRequested) {
                using var message = new MemoryStream(); WebSocketReceiveResult received;
                do {
                    received = await _socket.ReceiveAsync(new ArraySegment<byte>(buffer), _stop.Token);
                    if (received.MessageType == WebSocketMessageType.Close) throw new IOException("Farm connection closed");
                    message.Write(buffer, 0, received.Count);
                    if (message.Length > 4 * 1024 * 1024) throw new IOException("Farm response is too large");
                } while (!received.EndOfMessage);
                var frame = GateProtocol.Decode(message.ToArray());
                if (frame.Type == 2 && _pending.TryRemove(frame.Sequence, out var waiter)) waiter.TrySetResult(frame);
            }
        } catch (Exception error) { _receiveError = error; foreach (var waiter in _pending.Values) waiter.TrySetException(new IOException("Farm connection ended", error)); }
    }
    internal async Task<JsonObject> Rpc(string service, string method, JsonObject value)
    {
        await _serial.WaitAsync(_stop.Token);
        long seq = 0;
        try {
            if (_receiveError != null) throw new IOException("Farm connection ended", _receiveError);
            if (Environment.GetCommandLineArgs().Contains("--trace-protocol")) Console.WriteLine("RPC " + method);
            string ns = service.Split('.')[1], request = ns + "." + method + "Request", reply = ns + "." + method + "Reply";
            // All requests use the game's generated protobuf classes. There is
            // no embedded JS business engine or Node process in this client.
            var encoded = await Http("/bridge", O(("op", "encode"), ("path", request), ("value", value)));
            byte[] bytes = Convert.FromBase64String(S(encoded, "b64"));
            if (bytes.Length > 0) bytes = RequireCiphertext(await Http("/crypto-task", O(("op", "e"), ("b64", Convert.ToBase64String(bytes)))));
            seq = Interlocked.Increment(ref _seq);
            var waiter = new TaskCompletionSource<GateProtocol.Frame>(TaskCreationOptions.RunContinuationsAsynchronously); _pending[seq] = waiter;
            await _socket.SendAsync(new ArraySegment<byte>(GateProtocol.Encode(service, method, seq, bytes)), WebSocketMessageType.Binary, true, _stop.Token);
            GateProtocol.Frame frame;
            try { frame = await waiter.Task.WaitAsync(TimeSpan.FromSeconds(25), _stop.Token); }
            catch (TimeoutException) { throw new IOException("RPC timeout: " + method); }
            if (frame.Error != 0) throw new IOException(method + ": " + frame.Error + " " + frame.Message);
            var decoded = await Http("/bridge", O(("op", "decode"), ("path", reply), ("b64", Convert.ToBase64String(frame.Body))));
            return P(decoded, "value") as JsonObject ?? new();
        } finally { if (seq > 0) _pending.TryRemove(seq, out _); _serial.Release(); }
    }
    internal static byte[] RequireCiphertext(JsonObject result)
    {
        if (S(result, "error").Length > 0) throw new IOException("QQ 农场加密桥未就绪，请重新打开农场。");
        byte[] encrypted;
        try { encrypted = Convert.FromBase64String(S(result, "b64")); }
        catch (FormatException) { throw new IOException("QQ 农场加密桥返回了无效数据。"); }
        if (encrypted.Length == 0) throw new IOException("QQ 农场加密桥返回空数据，已阻止发送请求；请重新打开农场。");
        return encrypted;
    }
    public async ValueTask DisposeAsync()
    {
        _stop.Cancel(); _socket.Abort();
        if (_receiver != null) try { await _receiver; } catch { }
        _socket.Dispose(); _http.Dispose(); _stop.Dispose(); _serial.Dispose();
    }
}
