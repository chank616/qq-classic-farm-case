// Plant-shape probe: the empty farm must be replanted, and the tray's Plant request was
// rejected with 1000020 InvalidRequest. This probe confirms the bag contents (read only)
// and then tries the documented request variants against the live server until one is
// accepted, replanting every empty land with the shape the server accepted.
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using FarmTray.Native;

string root = args.Length > 0 ? args[0] : Directory.GetCurrentDirectory();
var report = new JsonObject { ["generatedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["farmStarted"] = false };
long seed = args.Length > 1 ? long.Parse(args[1]) : 20102;

using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(180));
using var crypto = new OfflineTsdk(Path.Combine(AppContext.BaseDirectory, "tsdk.wasm"));
await using var qq = new QqSessionProvider();
await qq.Connect(stop.Token);
string code = await qq.GetCode(stop.Token);
using var socket = new ClientWebSocket();
await socket.ConnectAsync(new Uri("wss://gate-obt.nqf.qq.com/prod/ws?os=Windows&ver=" + FarmServerClient.ClientVersion +
    "&code=" + Uri.EscapeDataString(code) + "&platform=qq"), stop.Token);
code = "";
var serial = new SemaphoreSlim(1, 1);
long sequence = 0;

async Task<(JsonObject Value, long Error, string Message)> Rpc(string service, string method, JsonObject input)
{
    await serial.WaitAsync(stop.Token);
    try {
        string ns = service.Split('.')[1];
        byte[] body = FarmProtobuf.Encode(ns + "." + method + "Request", input);
        long seq = ++sequence;
        await socket.SendAsync(new ArraySegment<byte>(Envelope(service, method, seq, crypto.Encrypt(body))), WebSocketMessageType.Binary, true, stop.Token);
        byte[] buffer = new byte[65536];
        while (true) {
            using var stream = new MemoryStream(); WebSocketReceiveResult part;
            do {
                part = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), stop.Token);
                if (part.MessageType == WebSocketMessageType.Close) throw new IOException("closed");
                stream.Write(buffer, 0, part.Count);
            } while (!part.EndOfMessage);
            var frame = Unwrap(stream.ToArray());
            if (frame.Type != 2 || frame.Sequence != seq) continue;
            if (frame.Error != 0) return (new JsonObject(), frame.Error, frame.Message);
            return (FarmProtobuf.Decode(ns + "." + method + "Reply", frame.Body), 0, "");
        }
    } finally { serial.Release(); }
}

var device = new JsonObject { ["device_info"] = new JsonObject { ["client_version"] = FarmServerClient.ClientVersion, ["sys_software"] = "Windows", ["sys_hardware"] = "PC", ["network"] = "wifi" } };
var login = (await Rpc("gamepb.userpb.UserService", "Login", device.DeepClone().AsObject())).Value;
var player = (await Rpc("gamepb.userpb.UserService", "PlayerLogin", device)).Value;
var basic = player["basic"] as JsonObject ?? login["basic"] as JsonObject ?? throw new IOException("no account");
long gid = basic["gid"]!.GetValue<long>();
long scene = player["global_scene_id"]!.GetValue<long>();
report["account"] = new JsonObject { ["gid"] = gid, ["name"] = basic["name"]?.DeepClone(), ["level"] = basic["level"]?.DeepClone() };

// Read-only: what is actually in the bag (all tabs) for seeds and fertilizers.
var bag = new JsonObject();
foreach (long tab in new long[] { 0, 2, 3 }) {
    var data = (await Rpc("gamepb.itempb.ItemService", "GetBag", new JsonObject { ["global_scene_id"] = scene, ["tab_id"] = tab })).Value;
    var items = new JsonArray();
    foreach (var item in L(data, "physical_items").Concat(L(data, "virtual_items")))
        items.Add(new JsonObject { ["id"] = N(item, "id"), ["count"] = N(item, "count"), ["uid"] = N(item, "uid"), ["locked"] = B(item, "is_locked") });
    bag["tab" + tab] = items;
    bag["tab" + tab + "Seed" + seed] = L(data, "physical_items").Concat(L(data, "virtual_items")).Where(i => N(i, "id") == seed).Sum(i => N(i, "count"));
}
report["bag"] = bag;

async Task<List<long>> EmptyLands()
{
    var lands = (await Rpc("gamepb.plantpb.PlantService", "AllLands", new JsonObject { ["host_gid"] = gid })).Value;
    return L(lands, "lands").Where(l => P(l, "plant") == null).Select(l => N(l, "id")).ToList();
}
var empty = await EmptyLands();
report["emptyBefore"] = new JsonArray(empty.Select(id => (JsonNode)JsonValue.Create(id)).ToArray());

var attempts = new JsonArray();
async Task<bool> Try(string name, JsonObject request, List<long> lands)
{
    var (value, error, message) = await Rpc("gamepb.plantpb.PlantService", "Plant", request);
    attempts.Add(new JsonObject { ["variant"] = name, ["lands"] = lands.Count, ["error"] = error, ["message"] = message,
        ["replyLands"] = L(value, "land").Count });
    Console.WriteLine((error == 0 ? "[ok]   " : "[fail] ") + name + " lands=" + lands.Count + " err=" + error + " " + message);
    return error == 0;
}
try {
    if (empty.Count > 0) {
        var all = empty.ToList();
        await Try("A items+auto_slave(false), all lands", new JsonObject { ["items"] = new JsonArray(new JsonObject {
            ["seed_id"] = seed, ["land_ids"] = new JsonArray(all.Select(id => (JsonNode)JsonValue.Create(id)).ToArray()), ["auto_slave"] = false }) }, all);
        await Try("B items without auto_slave, all lands", new JsonObject { ["items"] = new JsonArray(new JsonObject {
            ["seed_id"] = seed, ["land_ids"] = new JsonArray(all.Select(id => (JsonNode)JsonValue.Create(id)).ToArray()) }) }, all);
        await Try("C items single land (reference bot shape)", new JsonObject { ["items"] = new JsonArray(new JsonObject {
            ["seed_id"] = seed, ["land_ids"] = new JsonArray(JsonValue.Create(all[0])) }) }, new List<long> { all[0] });
        await Try("D land_and_seed map", new JsonObject { ["land_and_seed"] = new JsonObject { [all[0].ToString()] = seed } }, new List<long> { all[0] });
        await Rpc("gamepb.plantpb.PlantService", "RefreshLands", new JsonObject { ["host_gid"] = gid, ["land_ids"] = new JsonArray(JsonValue.Create(all[0])), ["host_type"] = 0, ["reason"] = 0 });
        await Try("E RefreshLands then single land", new JsonObject { ["items"] = new JsonArray(new JsonObject {
            ["seed_id"] = seed, ["land_ids"] = new JsonArray(JsonValue.Create(all[0])) }) }, new List<long> { all[0] });

        var remaining = await EmptyLands();
        report["emptyAfterAttempts"] = new JsonArray(remaining.Select(id => (JsonNode)JsonValue.Create(id)).ToArray());
        // Plant every still empty land one by one with the reference-bot shape.
        var planted = new JsonArray(); var failed = new JsonArray();
        foreach (long id in remaining) {
            var ok = await Try("single@" + id, new JsonObject { ["items"] = new JsonArray(new JsonObject {
                ["seed_id"] = seed, ["land_ids"] = new JsonArray(JsonValue.Create(id)) }) }, new List<long> { id });
            (ok ? planted : failed).Add(JsonValue.Create(id));
        }
        report["plantedLands"] = planted; report["failedLands"] = failed;
    }
    var final = await EmptyLands();
    report["emptyFinal"] = new JsonArray(final.Select(id => (JsonNode)JsonValue.Create(id)).ToArray());
} catch (Exception error) { report["error"] = error.GetType().Name + ": " + error.Message; }

report["attempts"] = attempts;
string file = Path.Combine(root, "artifacts", "plant-probe-" + DateTimeOffset.Now.ToString("yyyyMMdd-HHmmss") + ".json");
Directory.CreateDirectory(Path.GetDirectoryName(file)!);
File.WriteAllText(file, report.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
report["reportPath"] = file;
Console.WriteLine(report.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));

static JsonArray L(JsonNode node, string name) => (node as JsonObject)?[name] as JsonArray ?? new JsonArray();
static JsonObject P(JsonNode node, string name) => (node as JsonObject)?[name] as JsonObject;
static long N(JsonNode node, string name) => (node as JsonObject)?[name] is JsonValue value && value.TryGetValue<long>(out var number) ? number : 0;
static bool B(JsonNode node, string name) => (node as JsonObject)?[name] is JsonValue value && value.TryGetValue<bool>(out var flag) && flag;
static void Varint(Stream output, ulong number) { while (number >= 128) { output.WriteByte((byte)((number & 127) | 128)); number >>= 7; } output.WriteByte((byte)number); }
static void Field(Stream output, int field, byte[] value) { Varint(output, (ulong)((field << 3) | 2)); Varint(output, (ulong)value.Length); output.Write(value); }
static void Text(Stream output, int field, string value) => Field(output, field, Encoding.UTF8.GetBytes(value));
static byte[] Envelope(string service, string method, long sequence, byte[] body)
{
    using var meta = new MemoryStream();
    Text(meta, 1, service); Text(meta, 2, method);
    Varint(meta, (ulong)(3 << 3)); Varint(meta, 1);
    Varint(meta, (ulong)(4 << 3)); Varint(meta, (ulong)sequence);
    Varint(meta, (ulong)(5 << 3)); Varint(meta, 0);
    const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    string token = new(RandomNumberGenerator.GetBytes(RandomNumberGenerator.GetInt32(64, 128)).Select(b => alphabet[b & 63]).ToArray());
    using var frame = new MemoryStream(); Field(frame, 1, meta.ToArray()); Field(frame, 2, body); Text(frame, 3, token + "=");
    return frame.ToArray();
}
static ulong ReadVarint(byte[] data, ref int at)
{
    ulong result = 0;
    for (int shift = 0; shift < 70; shift += 7) { byte b = data[at++]; result |= (ulong)(b & 127) << shift; if ((b & 128) == 0) return result; }
    throw new InvalidDataException("bad varint");
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
static (long Type, long Sequence, long Error, string Message, byte[] Body) Unwrap(byte[] data)
{
    byte[] meta = Array.Empty<byte>(), body = Array.Empty<byte>();
    foreach (var (field, _, bytes) in Fields(data)) { if (field == 1) meta = bytes; else if (field == 2) body = bytes; }
    long type = 0, seq = 0, error = 0; string message = "";
    foreach (var (field, number, bytes) in Fields(meta)) {
        if (field == 3) type = (long)number; else if (field == 4) seq = (long)number;
        else if (field == 6) error = (long)number; else if (field == 7) message = Encoding.UTF8.GetString(bytes);
    }
    return (type, seq, error, message, body);
}
