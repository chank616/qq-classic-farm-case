using System.IO.Pipes;
using System.Text;
using System.Text.Json.Nodes;

namespace FarmTray.Native;

public static class QqSessionPipe
{
    public static async Task<string> GetCode(string pipeName, string token, CancellationToken cancellation)
    {
        using var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
        await pipe.ConnectAsync(10000, cancellation);
        using var writer = new StreamWriter(pipe, new UTF8Encoding(false), leaveOpen: true) { AutoFlush = true };
        using var reader = new StreamReader(pipe, Encoding.UTF8, leaveOpen: true);
        await writer.WriteLineAsync(new JsonObject { ["token"] = token }.ToJsonString().AsMemory(), cancellation);
        string text = await reader.ReadLineAsync(cancellation) ?? throw new IOException("QQ authentication pipe closed");
        if (text.Length > 8192) throw new InvalidDataException("QQ authentication response too large");
        var response = JsonNode.Parse(text)!;
        if (response["error"] != null) throw new IOException("QQ session authentication failed");
        string code = response["code"]?.GetValue<string>() ?? "";
        if (code.Length < 16 || code.Length > 512) throw new InvalidDataException("QQ returned no valid login code");
        return code;
    }
}
