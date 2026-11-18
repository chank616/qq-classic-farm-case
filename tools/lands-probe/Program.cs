// Read-only diagnostic probe: captures the raw wire layout of gamepb.plantpb.PlantService/AllLands
// through the same existing-QQ-session path the tray uses. It performs no game-state writes
// (only Login, PlayerLogin, AllLands) and stores no credentials.
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using FarmTray.Native;

string root = args.Length > 0 ? args[0] : Directory.GetCurrentDirectory();
string wasm = Path.Combine(AppContext.BaseDirectory, "tsdk.wasm");
var report = new JsonObject { ["generatedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["farmStarted"] = false, ["qqRestarted"] = false };

using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(150));
using var crypto = new OfflineTsdk(wasm);
await using var qq = new QqSessionProvider();
await qq.Connect(stop.Token);
string code = await qq.GetCode(stop.Token);
report["qqPid"] = qq.QqPid; report["codeLength"] = code.Length;

using var socket = new ClientWebSocket();
await socket.ConnectAsync(new Uri("wss://gate-obt.nqf.qq.com/prod/ws?os=Windows&ver=" + FarmServerClient.ClientVersion +
    "&code=" + Uri.EscapeDataString(code) + "&platform=qq"), stop.Token);
code = "";
var serial = new SemaphoreSlim(1, 1);
long sequence = 0;

async Task<(JsonObject Value, byte[] Body)> Rpc(string service, string method, JsonObject input)
{
    await serial.WaitAsync(stop.Token);
    try {
        string ns = service.Split('.')[1];
        byte[] body = FarmProtobuf.Encode(ns + "." + method + "Request", input);
        long seq = ++sequence;
        await socket.SendAsync(new ArraySegment<byte>(Envelope(service, method, seq, crypto.Encrypt(body))), WebSocketMessageType.Binary, true, stop.Token);
        byte[] buffer = new byte[32768];
        while (true) {
            using var stream = new MemoryStream(); WebSocketReceiveResult part;
            do {
                part = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), stop.Token);
                if (part.MessageType == WebSocketMessageType.Close) throw new IOException("closed");
                stream.Write(buffer, 0, part.Count);
            } while (!part.EndOfMessage);
            var frame = Unwrap(stream.ToArray());
            if (frame.Type != 2 || frame.Sequence != seq) continue;
            if (frame.Error != 0) throw new IOException(method + " rejected: " + frame.Error);
            return (FarmProtobuf.Decode(ns + "." + method + "Reply", frame.Body), frame.Body);
        }
    } finally { serial.Release(); }
}

var device = new JsonObject { ["device_info"] = new JsonObject { ["client_version"] = FarmServerClient.ClientVersion, ["sys_software"] = "Windows", ["sys_hardware"] = "PC", ["network"] = "wifi" } };
var login = (await Rpc("gamepb.userpb.UserService", "Login", device.DeepClone().AsObject())).Value;
var player = (await Rpc("gamepb.userpb.UserService", "PlayerLogin", device)).Value;
var basic = player["basic"] as JsonObject ?? login["basic"] as JsonObject ?? throw new IOException("no account");
long gid = basic["gid"]!.GetValue<long>();
long serverMillis = player["time_now_millis"]?.GetValue<long>() ?? 0;
long nowSec = (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + (serverMillis > 0 ? serverMillis - DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() : 0)) / 1000;
report["account"] = new JsonObject { ["name"] = basic["name"]?.DeepClone(), ["gid"] = gid, ["level"] = basic["level"]?.DeepClone() };
report["serverNowSec"] = nowSec;

var landed = await Rpc("gamepb.plantpb.PlantService", "AllLands", new JsonObject { ["host_gid"] = gid });
report["allLandsDecoded"] = landed.Value.DeepClone();
report["allLandsBodyBytes"] = landed.Body.Length;
report["allLandsReplyFields"] = Strings(Scan(landed.Body));

// Walk the wire manually: AllLandsReply.lands (field 1) -> LandInfo.plant (field 10) -> PlantInfo.
var lands = new JsonArray();
foreach (byte[] landBytes in SubMessages(landed.Body, 1)) {
    byte[] plantBytes = SubMessages(landBytes, 10).FirstOrDefault();
    var entry = new JsonObject { ["landFields"] = Strings(Scan(landBytes)) };
    if (plantBytes == null) { entry["plant"] = null; lands.Add(entry); continue; }
    entry["plantFields"] = Strings(Scan(plantBytes));
    entry["plantBytes"] = plantBytes.Length;
    entry["plantDecoded"] = FarmProtobuf.Decode("plantpb.PlantInfo", plantBytes).DeepClone();
    foreach (byte[] phaseBytes in SubMessages(plantBytes, 4))
        (entry["phaseRaw"] ??= new JsonArray()).AsArray().Add(Strings(Scan(phaseBytes)));
    lands.Add(entry);
}
report["perLand"] = lands;
report["landCount"] = lands.Count;

string file = Path.Combine(root, "artifacts", "lands-probe-" + DateTimeOffset.Now.ToString("yyyyMMdd-HHmmss") + ".json");
Directory.CreateDirectory(Path.GetDirectoryName(file)!);
File.WriteAllText(file, report.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
report["reportPath"] = file;
Console.WriteLine(report.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));

static JsonArray Strings(List<string> values)
{
    var array = new JsonArray();
    foreach (string value in values) array.Add(JsonValue.Create(value));
    return array;
}
static ulong ReadVarint(byte[] data, ref int at)
{
    ulong result = 0;
    for (int shift = 0; shift < 70; shift += 7) { byte b = data[at++]; result |= (ulong)(b & 127) << shift; if ((b & 128) == 0) return result; }
    throw new InvalidDataException("bad varint");
}
static void Varint(Stream output, ulong number) { while (number >= 128) { output.WriteByte((byte)((number & 127) | 128)); number >>= 7; } output.WriteByte((byte)number); }
static void Field(Stream output, int field, byte[] value) { Varint(output, (ulong)((field << 3) | 2)); Varint(output, (ulong)value.Length); output.Write(value); }
static void Text(Stream output, int field, string value) => Field(output, field, Encoding.UTF8.GetBytes(value));
static byte[] Envelope(string service, string method, long sequence, byte[] body)
{
    using var meta = new MemoryStream();
    Text(meta, 1, service); Text(meta, 2, method); Varint(meta, (ulong)(3 << 3)); Varint(meta, 1);
    Varint(meta, (ulong)(4 << 3)); Varint(meta, (ulong)sequence); Varint(meta, (ulong)(5 << 3)); Varint(meta, 0);
    const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    string token = new(RandomNumberGenerator.GetBytes(RandomNumberGenerator.GetInt32(64, 128)).Select(b => alphabet[b & 63]).ToArray());
    using var frame = new MemoryStream(); Field(frame, 1, meta.ToArray()); Field(frame, 2, body); Text(frame, 3, token + "=");
    return frame.ToArray();
}
static (long Type, long Sequence, long Error, byte[] Body) Unwrap(byte[] data)
{
    byte[] meta = Array.Empty<byte>(), body = Array.Empty<byte>();
    foreach (var (field, _, bytes) in Fields(data)) { if (field == 1) meta = bytes; else if (field == 2) body = bytes; }
    long type = 0, seq = 0, error = 0;
    foreach (var (field, number, _) in Fields(meta)) { if (field == 3) type = (long)number; else if (field == 4) seq = (long)number; else if (field == 6) error = (long)number; }
    return (type, seq, error, body);
}
static IEnumerable<(int Field, ulong Number, byte[] Bytes)> Fields(byte[] data)
{
    int at = 0;
    while (at < data.Length) {
        ulong tag = ReadVarint(data, ref at); int field = (int)(tag >> 3), wire = (int)(tag & 7);
        if (wire == 0) yield return (field, ReadVarint(data, ref at), Array.Empty<byte>());
        else if (wire == 2) { int n = (int)ReadVarint(data, ref at); var bytes = data.AsSpan(at, n).ToArray(); at += n; yield return (field, 0, bytes); }
        else if (wire == 5) { at += 4; yield return (field, 0, Array.Empty<byte>()); }
        else if (wire == 1) { at += 8; yield return (field, 0, Array.Empty<byte>()); }
        else throw new InvalidDataException("wire " + wire);
    }
}
static List<string> Scan(byte[] data)
{
    var list = new List<string>(); int at = 0;
    while (at < data.Length) {
        ulong tag = ReadVarint(data, ref at); int number = (int)(tag >> 3), wire = (int)(tag & 7);
        if (wire == 0) list.Add(number + ":varint=" + ReadVarint(data, ref at));
        else if (wire == 2) { int n = (int)ReadVarint(data, ref at); list.Add(number + ":bytes[" + n + "]=" + Convert.ToHexString(data.AsSpan(at, Math.Min(n, 32)))); at += n; }
        else if (wire == 5) { list.Add(number + ":fixed32=" + BitConverter.ToUInt32(data, at)); at += 4; }
        else if (wire == 1) { list.Add(number + ":fixed64=" + BitConverter.ToUInt64(data, at)); at += 8; }
        else throw new InvalidDataException("wire " + wire);
    }
    return list;
}
static List<byte[]> SubMessages(byte[] data, int field)
{
    var found = new List<byte[]>(); int at = 0;
    while (at < data.Length) {
        ulong tag = ReadVarint(data, ref at); int number = (int)(tag >> 3), wire = (int)(tag & 7);
        if (wire == 0) ReadVarint(data, ref at);
        else if (wire == 2) { int n = (int)ReadVarint(data, ref at); if (number == field) found.Add(data.AsSpan(at, n).ToArray()); at += n; }
        else if (wire == 5) at += 4;
        else if (wire == 1) at += 8;
        else throw new InvalidDataException("wire " + wire);
    }
    return found;
}
