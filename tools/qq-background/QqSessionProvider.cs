using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace FarmTray.Native;

public sealed class QqSessionProvider : IAsyncDisposable
{
    private NamedPipeClientStream? _pipe;
    private StreamReader? _reader;
    private StreamWriter? _writer;
    private readonly string _token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    private readonly SemaphoreSlim _serial = new(1);
    public int QqPid { get; private set; }
    public async Task Connect(CancellationToken cancellation)
    {
        using var qq = NativeQqAttach.FindExistingQq(); QqPid = qq.Id;
        string pipeName = "QQFarm-Session-" + Guid.NewGuid().ToString("N");
        using var resource = typeof(QqSessionProvider).Assembly.GetManifestResourceStream("qq-session-provider.js")!;
        using var text = new StreamReader(resource);
        string source = (await text.ReadToEndAsync(cancellation)).Replace("__PIPE_NAME__", JsonSerializer.Serialize(pipeName)).Replace("__PIPE_TOKEN__", JsonSerializer.Serialize(_token));
        await Task.Run(() => NativeQqAttach.Install(qq, source, cancellation), cancellation);
        _pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
        await _pipe.ConnectAsync(15000, cancellation);
        _reader = new StreamReader(_pipe, Encoding.UTF8, leaveOpen: true);
        _writer = new StreamWriter(_pipe, new UTF8Encoding(false), leaveOpen: true) { AutoFlush = true };
        var hello = await Request("hello", cancellation);
        if (hello["ready"]?.GetValue<bool>() != true || hello["qqPid"]?.GetValue<int>() != QqPid) throw new IOException("QQ 会话验证失败");
    }
    private async Task<JsonObject> Request(string operation, CancellationToken cancellation)
    {
        await _serial.WaitAsync(cancellation);
        try {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation); timeout.CancelAfter(20000);
            await _writer!.WriteLineAsync(new JsonObject { ["token"] = _token, ["op"] = operation }.ToJsonString().AsMemory(), timeout.Token);
            string text = await _reader!.ReadLineAsync(timeout.Token) ?? throw new IOException("QQ 会话已断开");
            if (text.Length > 8192) throw new IOException("QQ 会话响应无效");
            var reply = JsonNode.Parse(text)!.AsObject();
            if (reply["error"] != null) throw new IOException("QQ 后台授权请求失败"); return reply;
        } finally { _serial.Release(); }
    }
    public async Task<string> GetCode(CancellationToken cancellation)
    {
        var result = await Request("get-code", cancellation);
        string code = result["code"]?.GetValue<string>() ?? "";
        if (code.Length < 16 || code.Length > 512) throw new IOException("QQ 未返回有效授权码"); return code;
    }
    public async ValueTask DisposeAsync()
    {
        if (_writer != null) await _writer.DisposeAsync(); _reader?.Dispose(); _pipe?.Dispose(); _serial.Dispose();
    }
}
