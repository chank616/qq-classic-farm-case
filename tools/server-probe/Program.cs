using System.Text.Json.Nodes;
using FarmTray.Native;
using System.Runtime.InteropServices;

if (args.Contains("--bridge-self-test")) {
    nint module = NativeLibrary.Load(Path.Combine(AppContext.BaseDirectory, "QQFarmBridge.dll"));
    nint packet = Marshal.AllocHGlobal(32);
    try {
        byte[] data = new byte[32]; System.Text.Encoding.UTF8.GetBytes("void 0").CopyTo(data, 8); BitConverter.GetBytes(6).CopyTo(data, 4); Marshal.Copy(data, 0, packet, data.Length);
        var install = Marshal.GetDelegateForFunctionPointer<BridgeInstall>(NativeLibrary.GetExport(module, "FarmBridgeInstall"));
        uint status = install(packet);
        if (status != 3 || Marshal.ReadInt32(packet) != 102) throw new InvalidDataException("Native bridge process guard failed");
        Console.WriteLine("Native bootstrap rejects a process without QQ runtime: passed"); return;
    } finally { Marshal.FreeHGlobal(packet); NativeLibrary.Free(module); }
}

string stage = "offline-tsdk";
var report = new JsonObject { ["startedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["runtime"] = "csharp-offline-tsdk", ["qqStarted"] = false, ["farmStarted"] = false, ["serverVerified"] = false };
using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(args.Contains("--idle-check") ? 150 : 90));
try {
    using var crypto = new OfflineTsdk(args[0]);
    stage = "existing-qq-code";
    await using var qq = new QqSessionProvider();
    string code;
    if (args.Contains("--native-attach")) { await qq.Connect(stop.Token); code = await qq.GetCode(stop.Token); report["qqPid"] = qq.QqPid; }
    else code = await QqSessionPipe.GetCode(Environment.GetEnvironmentVariable("QQ_FARM_PIPE")!, Environment.GetEnvironmentVariable("QQ_FARM_PIPE_TOKEN")!, stop.Token);
    report["codeLength"] = code.Length;
    stage = "websocket";
    await using var client = new FarmServerClient(crypto); await client.Connect(code, stop.Token); code = "";
    var device = new JsonObject { ["client_version"] = FarmServerClient.ClientVersion, ["sys_software"] = "Windows", ["sys_hardware"] = "PC", ["network"] = "wifi" };
    stage = "Login";
    var login = await client.Rpc("gamepb.userpb.UserService", "Login", new() { ["device_info"] = device.DeepClone() }, stop.Token);
    stage = "PlayerLogin";
    var player = await client.Rpc("gamepb.userpb.UserService", "PlayerLogin", new() { ["device_info"] = device.DeepClone() }, stop.Token);
    var basic = player["basic"] ?? login["basic"] ?? throw new InvalidDataException("No farm profile returned");
    long gid = basic["gid"]!.GetValue<long>();
    stage = "AllLands";
    var scene = await client.Rpc("gamepb.plantpb.PlantService", "AllLands", new() { ["host_gid"] = gid }, stop.Token);
    var lands = scene["lands"]?.AsArray() ?? throw new InvalidDataException("No farm land returned");
    if (gid <= 0 || lands.Count != 24) throw new InvalidDataException("Farm profile or land verification failed");
    report["accountName"] = basic["name"]?.DeepClone(); report["level"] = basic["level"]?.DeepClone(); report["landCount"] = lands.Count;
    report["globalSceneIdPresent"] = player["global_scene_id"] != null;
    if (args.Contains("--inspect-inventory")) {
        stage = "GetBag";
        var bag = await client.Rpc("gamepb.itempb.ItemService", "GetBag", new() { ["global_scene_id"] = player["global_scene_id"]!.DeepClone(), ["tab_id"] = 0 }, stop.Token);
        var inventory = new JsonObject { ["checkedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["mode"] = "read-only", ["bag"] = bag, ["lands"] = lands.DeepClone() };
        Directory.CreateDirectory("artifacts"); File.WriteAllText("artifacts/harvest-inventory-diagnostic.json", inventory.ToJsonString(new() { WriteIndented = true }));
        report["inventoryDiagnostic"] = "artifacts/harvest-inventory-diagnostic.json";
    }
    if (args.Contains("--idle-check")) {
        stage = "idle-heartbeat";
        for (int i = 0; i < 3; i++) {
            await Task.Delay(TimeSpan.FromSeconds(25), stop.Token);
            await client.Rpc("gamepb.userpb.UserService", "Heartbeat", new() { ["host_gid"] = gid, ["client_version"] = FarmServerClient.ClientVersion, ["host_type"] = 0 }, stop.Token);
        }
        var afterIdle = await client.Rpc("gamepb.plantpb.PlantService", "AllLands", new() { ["host_gid"] = gid }, stop.Token);
        if (afterIdle["lands"]?.AsArray().Count != 24) throw new InvalidDataException("Idle connection verification failed");
        // The QQ pipe is idle for the same period: request a fresh code over it.
        string nextCode = await qq.GetCode(stop.Token); report["freshCodeAfterIdle"] = nextCode.Length == 32; nextCode = "";
        report["idleSeconds"] = 75; report["heartbeatsVerified"] = 3; report["landCountAfterIdle"] = 24;
    }
    report["verifiedMethods"] = new JsonArray("Login", "PlayerLogin", "AllLands"); report["serverVerified"] = true;
    stage = "verified";
} catch (FarmRpcRejectedException error) { report["errorType"] = nameof(FarmRpcRejectedException); report["method"] = error.Method; report["serverErrorCode"] = error.ErrorCode; Environment.ExitCode = 1; }
catch (Exception error) { report["errorType"] = error.GetType().Name; Environment.ExitCode = 1; }
report["stage"] = stage; report["finishedAt"] = DateTimeOffset.UtcNow.ToString("O");
Directory.CreateDirectory("artifacts");
File.WriteAllText(args.Contains("--inspect-inventory") ? "artifacts/harvest-connection-diagnostic.json" : "artifacts/qq-only-server-verification.json", report.ToJsonString(new() { WriteIndented = true }));
Console.WriteLine(report.ToJsonString());

[UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate uint BridgeInstall(nint request);
