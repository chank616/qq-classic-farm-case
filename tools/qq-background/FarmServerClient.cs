using System.Net.WebSockets;
using System.Text.Json.Nodes;

namespace FarmTray.Native;

public sealed class FarmRpcRejectedException(string method, long error) : IOException(method + ": " + error)
{
    public string Method { get; } = method;
    public long ErrorCode { get; } = error;
}

public sealed class FarmServerClient(OfflineTsdk crypto, CancellationToken lifetime = default) : IAsyncDisposable
{
    public const string ClientVersion = "1.15.0.2_20261001";
    private readonly ClientWebSocket _socket = new();
    private readonly SemaphoreSlim _serial = new(1);
    private long _sequence;
    public Task Connect(string code) => Connect(code, lifetime);
    public Task<JsonObject> Rpc(string service, string method, JsonObject input) => Rpc(service, method, input, lifetime);
    public async Task Connect(string code, CancellationToken cancellation)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation); timeout.CancelAfter(15000);
        try { await _socket.ConnectAsync(new Uri("wss://gate-obt.nqf.qq.com/prod/ws?os=Windows&ver=" + ClientVersion + "&code=" + Uri.EscapeDataString(code) + "&platform=qq"), timeout.Token); }
        catch { throw new IOException("Farm websocket handshake failed"); }
    }
    public async Task<JsonObject> Rpc(string service, string method, JsonObject input, CancellationToken cancellation)
    {
        await _serial.WaitAsync(cancellation);
        try {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation); timeout.CancelAfter(25000);
            string ns = service.Split('.')[1];
            byte[] body = FarmProtobuf.Encode(ns + "." + method + "Request", input);
            long sequence = ++_sequence;
            await _socket.SendAsync(GateProtocol.Encode(service, method, sequence, crypto.Encrypt(body)), WebSocketMessageType.Binary, true, timeout.Token);
            byte[] buffer = new byte[32768];
            while (true) {
                using var stream = new MemoryStream(); WebSocketReceiveResult part;
                do {
                    part = await _socket.ReceiveAsync(new ArraySegment<byte>(buffer), timeout.Token);
                    if (part.MessageType == WebSocketMessageType.Close) throw new IOException("Farm server closed connection");
                    stream.Write(buffer, 0, part.Count);
                    if (stream.Length > 4 * 1024 * 1024) throw new InvalidDataException("Farm response too large");
                } while (!part.EndOfMessage);
                var frame = GateProtocol.Decode(stream.ToArray());
                if (frame.Type != 2 || frame.Sequence != sequence) continue;
                if (frame.Error != 0) throw new FarmRpcRejectedException(method, frame.Error);
                return FarmProtobuf.Decode(ns + "." + method + "Reply", frame.Body);
            }
        } finally { _serial.Release(); }
    }
    public ValueTask DisposeAsync() { _socket.Abort(); _socket.Dispose(); _serial.Dispose(); return ValueTask.CompletedTask; }
}
