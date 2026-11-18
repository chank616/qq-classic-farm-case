using System.Diagnostics;
using System.Text.Json.Nodes;
using static FarmTray.Native.JsonData;

namespace FarmTray.Native;

internal static class NativeFarmRunner
{
    private static readonly SemaphoreSlim InProcess = new(1, 1);
    internal static async Task<int> Run(bool dry, CancellationToken token = default)
    {
        if (!await InProcess.WaitAsync(0, token)) return 3;
        string runId = Guid.NewGuid().ToString(), file = Path.Combine(FarmPaths.Artifacts, "farm-client.lock");
        FileStream lease = null; bool acquired = false;
        try {
            Directory.CreateDirectory(FarmPaths.Artifacts);
            for (int attempt = 0; attempt < 2; attempt++) {
                try { lease = new FileStream(file, FileMode.CreateNew, FileAccess.Write, FileShare.Read); acquired = true; break; }
                catch (IOException) when (File.Exists(file)) {
                    if (!int.TryParse(File.ReadAllText(file), out int pid)) throw new IOException("Cannot read existing farm-client lock");
                    bool alive; try { using var p = Process.GetProcessById(pid); alive = !p.HasExited; } catch (ArgumentException) { alive = false; }
                    if (alive) return 3;
                    File.Delete(file);
                }
            }
            if (!acquired) throw new IOException("Cannot acquire farm-client lock");
            byte[] owner = System.Text.Encoding.ASCII.GetBytes(Environment.ProcessId.ToString()); lease.Write(owner); lease.Flush(true);
            void Emit(JsonObject value) { value["runId"] = runId; value["runtime"] = "csharp"; FarmBridgeHost.Log(value); }
            Emit(O(("type", "pass-started"), ("mode", dry ? "inspection" : "execute")));
            using var crypto = new OfflineTsdk(Path.Combine(AppContext.BaseDirectory, "tsdk.wasm"));
            await using var qq = new QqSessionProvider(); await qq.Connect(token);
            string code = await qq.GetCode(token);
            await using var connection = new FarmServerClient(crypto, token); await connection.Connect(code); code = "";
            Emit(O(("type", "qq-session-connected"), ("qqPid", qq.QqPid), ("offlineTsdk", true), ("farmStarted", false)));
            var device = O(("device_info", O(("client_version", FarmServerClient.ClientVersion), ("sys_software", "Windows"), ("sys_hardware", "PC"), ("network", "wifi"))));
            var login = await connection.Rpc("gamepb.userpb.UserService", "Login", device);
            var player = await connection.Rpc("gamepb.userpb.UserService", "PlayerLogin", device);
            var basic = P(player, "basic") as JsonObject ?? P(login, "basic") as JsonObject ?? throw new IOException("Login returned no account");
            long scene = N(player, "global_scene_id"); if (scene <= 0) throw new IOException("PlayerLogin returned no farm scene");
            long serverMillis = N(player, "time_now_millis"); if (serverMillis <= 0) serverMillis = N(login, "time_now_millis");
            long offset = serverMillis > 0 ? serverMillis - DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() : 0;
            long Clock() => (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + offset) / 1000;
            var bag = FertilizerStock.FromBag(await connection.Rpc("gamepb.itempb.ItemService", "GetBag", O(("global_scene_id", scene), ("tab_id", 2))), Clock());
            Emit(O(("type", "profile"), ("name", S(basic, "name")), ("gid", N(basic, "gid")), ("level", N(basic, "level")), ("gold", N(basic, "gold")), ("exp", N(basic, "exp")),
                ("points", bag.Points), ("fertHours", bag.Bucket[1011] / 3600.0), ("fertOrgHours", bag.Bucket[1012] / 3600.0)));
            using var heartbeatStop = CancellationTokenSource.CreateLinkedTokenSource(token);
            var heartbeat = Task.Run(async () => {
                try { while (true) {
                    await Task.Delay(TimeSpan.FromSeconds(25), heartbeatStop.Token);
                    await connection.Rpc("gamepb.userpb.UserService", "Heartbeat", O(("host_gid", S(basic, "gid")), ("client_version", FarmServerClient.ClientVersion), ("host_type", 0)));
                } } catch (OperationCanceledException) { } catch (IOException) { }
            }, heartbeatStop.Token);
            JsonObject report;
            string stateFile = Path.Combine(FarmPaths.Artifacts, "farm-schedule.json");
            var state = Load(stateFile);
            try { report = await new FarmWorkflow(connection.Rpc, basic, scene, dry, Emit, Clock, state["fertilizerDecision"], token: token).Run(); }
            finally { heartbeatStop.Cancel(); try { await heartbeat; } catch (OperationCanceledException) { } }
            report["runId"] = runId; report["serverClockOffsetMs"] = offset;
            report["connection"] = O(("mode", "existing-qq-session"), ("qqPid", qq.QqPid), ("offlineTsdk", true), ("qqStarted", false), ("farmStarted", false));
            string reportFile = Path.Combine(FarmPaths.Artifacts, "reports", "farm-csharp-" + DateTimeOffset.UtcNow.ToString("yyyy-MM-ddTHH-mm-ss-fffZ") + "-" + runId[..8] + ".json");
            report["reportPath"] = reportFile; Save(reportFile, report);
            Save(Path.Combine(FarmPaths.Artifacts, dry ? "farm-inspection.json" : "farm-status.json"), report);
            if (!dry && report["cropClock"] is JsonObject) Save(Path.Combine(FarmPaths.Artifacts, "farm-last-state.json"), report);
            if (!dry) {
                state["lastAttempt"] = Copy(report["startedAt"]); state["lastPass"] = Copy(report["finishedAt"]); state["day"] = S(report, "day");
                state["lastStatus"] = S(report, "status"); state["runtime"] = "csharp"; state["cropClock"] = Copy(report["cropClock"]);
                state["fertilizerDecision"] = Copy(report["fertilizerDecisionState"]);
                if (B(report, "allRequiredComplete")) { state["lastVerifiedDay"] = S(report, "day"); state["lastSuccess"] = Copy(report["finishedAt"]); }
                Save(stateFile, state);
            }
            Emit(O(("type", dry ? "inspection-finished" : "pass-finished"), ("status", S(report, "status")), ("allRequiredComplete", B(report, "allRequiredComplete")), ("reportPath", reportFile)));
            foreach (var check in L(report, "checks")) Console.WriteLine("[" + S(check, "status") + "] " + S(check, "id") + ": " + S(check, "detail"));
            Console.WriteLine("C# report: " + reportFile);
            return dry || B(report, "allRequiredComplete") ? 0 : L(report, "checks").Any(c => S(c, "status") == "failed") ? 1 : 2;
        } catch (Exception error) {
            bool waiting = error is FarmBridgeUnavailableException;
            var failure = O(("generatedAt", DateTimeOffset.UtcNow.ToString("O")), ("runtime", "csharp"), ("runId", runId), ("status", waiting ? "waiting-bridge" : "failed"),
                ("completed", false), ("allRequiredComplete", false), ("error", error is OperationCanceledException ? "Farm pass cancelled or timed out" : error.Message), ("mode", dry ? "inspection" : "execute"));
            Save(Path.Combine(FarmPaths.Artifacts, dry ? "farm-inspection.json" : "farm-status.json"), failure);
            FarmBridgeHost.Log(O(("type", waiting ? "pass-waiting" : "pass-failed"), ("runtime", "csharp"), ("runId", runId), ("err", S(failure, "error"))));
            Console.Error.WriteLine(S(failure, "error")); return waiting ? 4 : 1;
        } finally {
            lease?.Dispose(); if (acquired) try { File.Delete(file); } catch (IOException) { }
            InProcess.Release();
        }
    }
    private static JsonObject Load(string file) { try { return JsonNode.Parse(File.ReadAllText(file)) as JsonObject ?? new(); } catch { return new(); } }
}
