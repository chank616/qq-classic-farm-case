using System.Text.Json.Nodes;
using static FarmTray.Native.JsonData;

namespace FarmTray.Native;

internal static class NativeSelfChecks
{
    private static void Require(bool value, string message) { if (!value) throw new InvalidOperationException(message); }
    private sealed class ProbeHandler : HttpMessageHandler
    {
        internal bool Frozen, WrongCrypto;
        internal List<string> Requests = new();
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            string path = request.RequestUri.AbsolutePath; Requests.Add(path);
            var input = request.Content == null ? new JsonObject() : JsonNode.Parse(await request.Content.ReadAsStringAsync(token));
            if (path == "/bridge" && Frozen) return new(System.Net.HttpStatusCode.InternalServerError) { Content = new StringContent("{\"error\":\"QQ protobuf bridge timeout\"}") };
            var data = path == "/health" ? O(("hostReady", true), ("hasCode", true)) : O(("b64", path == "/crypto-task" && S(input, "op") == "d" && WrongCrypto ? "CAQ=" : "CAI="));
            return new(System.Net.HttpStatusCode.OK) { Content = new StringContent(data.ToJsonString()) };
        }
    }
    private sealed class Fixture
    {
        internal long Clock = 1792239000, Normal = 500000, Organic, Points, Seeds;
        internal long Gold = 100000;
        internal bool NoSaleEffect, NoSaleGold;
        internal bool MultiSeason;
        internal List<JsonNode> Fruits = new();
        internal bool Stealable, MissingSeeds, PartialHarvest, NoReward, NoUseEffect, HideDaily, HarvestNoProgress, EraseNoEffect;
        internal bool VipProductUnavailable;
        internal string FailMethod = "";
        internal List<JsonNode> Plots = new();
        internal List<(string Method, JsonObject Request)> Calls = new();
        internal Dictionary<long, long> Packs = new();
        internal List<JsonNode> Products = new();
        private JsonNode _decision;
        private readonly List<JsonNode> _tasks = new();
        internal Fixture()
        {
            for (int i = 0; i < 24; i++) Plots.Add(O(("id", i + 1), ("unlocked", true), ("plant", Plant(Clock - 100, Clock + 5000))));
            for (int i = 0; i < 3; i++) _tasks.Add(O(("id", 200019 + i), ("task_type", 2), ("cond_type", 16 + i), ("is_unlocked", true),
                ("progress", i == 0 ? 1 : 0), ("total_progress", 1), ("is_claimed", i == 0)));
        }
        private static JsonObject Plant(long growth, long mature) => O(("id", 1020102), ("name", "马蹄莲"), ("fruit_id", 40102), ("fruit_num", 800), ("left_fruit_num", 560), ("left_inorc_fert_times", 1),
            ("phases", A(new[] { O(("phase", 2), ("begin_time", growth)), O(("phase", 6), ("begin_time", mature)) })));
        internal void MatureAll() { foreach (var l in Plots.Where(l => P(l, "plant") != null)) L(l["plant"], "phases")[^1]["begin_time"] = Clock - 1; }
        // 枯死作物: the server keeps a single phase-7 entry without begin_time.
        internal void Wither(int count = 24) { for (int i = 0; i < count; i++) Plots[i]["plant"]["phases"] = A(new[] { O(("phase", 7)) }); }
        internal void DelayLastGrowth() => L(Plots[^1]["plant"], "phases")[0]["begin_time"] = Clock + 1000;
        internal void RefreshDaily() { foreach (var t in _tasks) { t["is_claimed"] = false; t["progress"] = N(t, "cond_type") == 16 ? 1 : 0; } }
        internal void CompleteDaily() { foreach (var t in _tasks) { t["progress"] = N(t, "total_progress"); t["is_claimed"] = true; } }
        internal async Task<JsonObject> Run(bool dry = false)
        {
            var r = await new FarmWorkflow(Rpc, O(("gid", "self"), ("name", "fixture"), ("level", 149)), 1, dry, now: () => Clock, previousDecision: _decision).Run();
            if (!dry) _decision = Copy(r["fertilizerDecisionState"]); return r;
        }
        internal int Count(string method) => Calls.Count(c => c.Method == method);
        internal List<JsonObject> Requests(string method) => Calls.Where(c => c.Method == method).Select(c => c.Request).ToList();
        private Task<JsonObject> Rpc(string service, string method, JsonObject request)
        {
            Calls.Add((method, (JsonObject)request.DeepClone()));
            if (method == FailMethod) throw new IOException(method + ": 99 fixture rejection");
            JsonObject result = new();
            switch (method) {
                case "AllLands": result["lands"] = A(Plots); break;
                case "GetBag":
                    result["virtual_items"] = A(new[] { O(("id", 1001), ("count", Gold)), O(("id", 1011), ("count", Normal)), O(("id", 1012), ("count", Organic)), O(("id", 1002), ("count", Points)) });
                    result["physical_items"] = A(new[] { O(("id", 20102), ("count", Seeds)) }.Concat(Packs.Where(p => p.Value > 0).Select(p => O(("id", p.Key), ("uid", p.Key), ("count", p.Value)))).Concat(Fruits.Where(f => N(f, "count") > 0))); break;
                case "Sell":
                    long earned = 0;
                    foreach (var sold in L(request, "items")) {
                        var stack = Fruits.Single(f => N(f, "uid") == N(sold, "uid") && N(f, "id") == N(sold, "id"));
                        Require(!B(stack, "is_locked") && N(sold, "count") == N(stack, "count"), "Sale changed protected inventory or did not clear the stack");
                        earned += N(sold, "count") * 131;
                        if (!NoSaleEffect) stack["count"] = 0;
                    }
                    if (!NoSaleGold) Gold += earned;
                    result["get_items"] = A(new[] { O(("id", 1001), ("count", earned)) }); break;
                case "ShopInfo": result["goods_list"] = A(new[] {
                    O(("id", 158), ("item_id", 20102), ("unlocked", true), ("price", 50), ("item_count", 1), ("conds", A(new[] { O(("type", 1), ("param", 148)) }))),
                    O(("id", 159), ("item_id", 20103), ("unlocked", true), ("price", 999), ("item_count", 1), ("conds", A(new[] { O(("type", 1), ("param", 140)) }))) }); break;
                case "Fertilize":
                    foreach (var land in Plots.Where(l => L(request, "land_ids").Any(id => N(id) == N(l, "id")))) {
                        long cost = FarmCrop.Mature(land["plant"]) - Clock;
                        if (N(request, "fertilizer_id") == 1011) { Require(Normal >= cost, "Mock container overdrawn"); Normal -= cost; }
                        else { Require(Organic >= cost, "Mock organic container overdrawn"); Organic -= cost; }
                        L(land["plant"], "phases")[^1]["begin_time"] = Clock - 1;
                    }
                    break;
                case "Harvest":
                    if (S(request, "host_gid") == "self") foreach (var land in Plots.Where(l => L(request, "land_ids").Any(id => N(id) == N(l, "id")))) {
                        if (!(PartialHarvest && N(land, "id") == 24)) {
                            long fruitId = N(land["plant"], "fruit_id"), harvestQuantity = N(land["plant"], "left_fruit_num");
                            if (Fruits.Where(f => N(f, "id") == fruitId).Sum(f => N(f, "count")) + harvestQuantity > 999990) throw new IOException("Harvest: 1003003");
                            Fruits.Add(O(("id", fruitId), ("uid", 100000 + Fruits.Count), ("count", harvestQuantity)));
                            if (!MultiSeason) land["plant"] = null;
                            else if (N(land["plant"], "season") < 2) {
                                var regrown = Plant(Clock + 100, Clock + 10000); regrown["season"] = 2; land["plant"] = regrown;
                            } else land["plant"]["phases"] = A(new[] { O(("phase", 7)) });
                        }
                    }
                    if (!HarvestNoProgress) _tasks[1]["progress"] = 1; break;
                case "RemovePlant":
                    var erased = Plots.Where(l => L(request, "land_ids").Any(id => N(id) == N(l, "id"))).ToList();
                    // Mirrors PlantMatureCannotRemove / EraseUnwitheredPlant: only withered crops may be erased.
                    if (erased.Any(l => P(l, "plant") == null || !FarmCrop.Dead(l["plant"], Clock))) throw new IOException("RemovePlant fixture rejection");
                    if (!EraseNoEffect) foreach (var land in erased) land["plant"] = null; break;
                case "BuyGoods": if (!MissingSeeds) Seeds += N(request, "num"); break;
                case "Plant":
                    foreach (var item in L(request, "items")) {
                        Require(N(item, "seed_id") == 20102, "Highest-level seed was not selected");
                        var ids = L(item, "land_ids").Select(Numeric).ToHashSet();
                        // 1000020 请求参数错误: the live server accepts exactly one land per PlantItem.
                        if (ids.Count != 1) throw new IOException("Plant: 1000020 fixture rejection");
                        Seeds -= ids.Count;
                        foreach (var l in Plots.Where(l => ids.Contains(N(l, "id")))) l["plant"] = Plant(Clock + 100, Clock + 10000);
                    }
                    break;
                case "Use":
                    if (!NoUseEffect) {
                        long id = N(request["item"], "id"), count = N(request["item"], "count"); Require(Packs.GetValueOrDefault(id) >= count, "Mock item overdrawn"); Packs[id] -= count;
                        if (id == 100003) Packs[80001] = Packs.GetValueOrDefault(80001) + count;
                        else { var pack = FertilizerBudget.Items[id]; if (pack.Type == 1011) Normal += pack.Seconds * count; else Organic += pack.Seconds * count; }
                    }
                    break;
                case "Purchase":
                    var product = Products.Single(p => N(p, "id") == N(request, "id")); long quantity = N(request, "buy_num");
                    Points -= N(product["price"], "count") * quantity;
                    if (!NoReward) foreach (var reward in L(product, "items")) Packs[N(reward, "id")] = Packs.GetValueOrDefault(N(reward, "id")) + N(reward, "count") * quantity;
                    result["success"] = true; break;
                case "TaskInfo": result["task_info"] = O(("tasks", HideDaily ? new JsonArray() : A(_tasks))); break;
                case "GetBriefInfo": result["friend_gids"] = A(new JsonNode[] { V("friend") }); break;
                case "GetGameFriends": result["friends"] = A(new[] { O(("gid", "friend"), ("plant", O(("dry_num", 1), ("steal_plant_num", Stealable ? 1 : 0)))) }); break;
                case "Enter": result["lands"] = A(new[] { O(("id", 99), ("plant", O(("dry_num", 1), ("stealable", Stealable), ("left_fruit_num", 10),
                    ("phases", A(new[] { O(("begin_time", Clock - 500)), O(("begin_time", Clock - 10)) }))))) }); break;
                case "WaterLand": _tasks[2]["progress"] = 1; break;
                case "BatchClaimTaskReward": foreach (var t in _tasks) if (L(request, "ids").Any(id => N(id) == N(t, "id"))) t["is_claimed"] = true; break;
                case "GetDailyGiftStatus": case "GetQQVipRewardsStatus": result = O(("is_qq_vip", !VipProductUnavailable), ("claimed_today", true)); break;
                case "GetMallListBySlotType":
                    result["products"] = N(request, "slot_type") == 1 ? A(new[] { O(("id", 10), ("name", "免费化肥"), ("is_free", true),
                        ("restriction", O(("max_count", 1), ("current_count", 1))), ("items", A(new[] { O(("id", 1011)) }))) }
                        .Concat(VipProductUnavailable ? new[] { O(("id", 1053), ("name", "SVIP商城每日免费"), ("is_free", true),
                            ("is_available_purchase", false), ("items", A(new[] { O(("id", 1011)) }))) } : Array.Empty<JsonObject>())
                        .Concat(Products)) : new JsonArray(); break;
            }
            return Task.FromResult(result);
        }
        private static long Numeric(JsonNode n) => N(n);
    }
    private static JsonObject PointProduct() => O(("id", 1003), ("slot_type", 1), ("price", O(("id", 1002), ("count", 34))),
        ("items", A(new[] { O(("id", 80001), ("count", 2)), O(("id", 80003), ("count", 1)) })));

    internal static async Task Run()
    {
        int count = 0; var names = new JsonArray();
        async Task Check(string name, Func<Task> test) { await test(); count++; names.Add(name); Console.WriteLine("[passed] " + name); }
        await Check("protobuf envelope roundtrip preserves sequence and encrypted body", () => {
            var frame = GateProtocol.Decode(GateProtocol.Encode("gamepb.userpb.UserService", "Login", 123456, new byte[] { 1, 2, 3 }));
            Require(frame.Type == 1 && frame.Sequence == 123456 && frame.Body.SequenceEqual(new byte[] { 1, 2, 3 }), "Gate frame mismatch"); return Task.CompletedTask;
        });
        await Check("truncated protobuf is rejected", () => { bool rejected = false; try { GateProtocol.Decode(new byte[] { 10, 20, 1 }); } catch (InvalidDataException) { rejected = true; } Require(rejected, "Truncated frame accepted"); return Task.CompletedTask; });
        await Check("empty or failed encryption never becomes a parameterless RPC", () => {
            foreach (var result in new[] { O(("b64", "")), O(("b64", "%%%")), O(("error", "crypto unavailable"), ("b64", "AQ==")) }) {
                bool rejected = false; try { FarmTransport.RequireCiphertext(result); } catch (IOException) { rejected = true; }
                Require(rejected, "Invalid encryption output was accepted");
            }
            Require(FarmTransport.RequireCiphertext(O(("b64", "CAI="))).SequenceEqual(new byte[] { 8, 2 }), "Valid encryption output rejected");
            return Task.CompletedTask;
        });
        await Check("a recent heartbeat does not conceal a frozen protobuf bridge", async () => {
            var handler = new ProbeHandler { Frozen = true }; using var http = new HttpClient(handler) { BaseAddress = new Uri("http://127.0.0.1") };
            Require(!await QqBootstrap.ProbeExistingBridge(http, default), "Frozen page was considered ready");
            Require(handler.Requests.SequenceEqual(new[] { "/health", "/bridge" }), "Frozen probe ran gameplay requests");
        });
        await Check("bridge readiness requires a live encode and a correct crypto roundtrip", async () => {
            foreach (bool wrong in new[] { false, true }) {
                var handler = new ProbeHandler { WrongCrypto = wrong }; using var http = new HttpClient(handler) { BaseAddress = new Uri("http://127.0.0.1") };
                Require(await QqBootstrap.ProbeExistingBridge(http, default) == !wrong, "Readiness ignored crypto roundtrip");
                Require(handler.Requests.Count(p => p == "/crypto-task") == 2, "Readiness did not verify both crypto directions");
            }
        });
        await Check("a failed refresh preserves cached lands and daily data without marking the pass verified", async () => {
            var report = await new Fixture().Run(); report["day"] = Day(Now); var snapshot = new Snapshot();
            using var cached = System.Text.Json.JsonDocument.Parse(report.ToJsonString()); DashboardData.ApplyReport(snapshot, cached.RootElement);
            using var failed = System.Text.Json.JsonDocument.Parse("{\"status\":\"waiting-bridge\",\"allRequiredComplete\":false}"); DashboardData.ApplyReport(snapshot, failed.RootElement);
            Require(snapshot.Lands.Count == 24 && snapshot.DailyClaimed == 3 && !snapshot.TodayVerified, "Failed refresh erased cached data or marked it verified");
        });
        await Check("24 lands fertilize, harvest, buy exact seed shortage and replant", async () => {
            var f = new Fixture(); var r = await f.Run(); Require(B(r, "allRequiredComplete") && N(r["farm"]["planted"], "verified") == 24, "Full cycle unverified");
            Require(L(f.Requests("Harvest").Single(), "land_ids").Count == 24, "Batch harvest split");
            Require(f.Count("Plant") == 24 && f.Requests("Plant").All(r => L(L(r, "items").Single(), "land_ids").Count == 1) &&
                f.Requests("Plant").SelectMany(r => L(L(r, "items").Single(), "land_ids")).Select(node => N(node)).OrderBy(id => id).SequenceEqual(Enumerable.Range(1, 24).Select(i => (long)i)), "Batch plant split");
            Require(N(f.Requests("BuyGoods").Single(), "num") == 24, "Seed overpurchase");
        });
        await Check("daily completion does not stop the second planting cycle", async () => {
            var f = new Fixture(); await f.Run(); f.Clock += 10000; var r = await f.Run();
            Require(N(r["farm"]["harvest"], "verified") == 24 && f.Count("Plant") == 48, "Loop stopped after daily completion");
        });
        await Check("early mature plot waits for all other 23", async () => {
            var f = new Fixture { Normal = 0 }; L(f.Plots[0]["plant"], "phases")[^1]["begin_time"] = f.Clock - 1;
            await f.Run(); Require(f.Count("Harvest") == 0 && f.Count("Plant") == 0, "Early plot was harvested"); f.Clock += 5000; await f.Run(); Require(f.Count("Plant") == 24, "Whole batch not planted");
        });
        await Check("fertilizer waits for the last final-growth stage", async () => {
            var f = new Fixture(); f.DelayLastGrowth(); var r = await f.Run(); Require(f.Count("Fertilize") == 0 && N(r["cropClock"], "batchFertilizeAt") == f.Clock + 1000, "Fertilized before last growth");
            f.Clock += 1000; await f.Run(); Require(f.Count("Fertilize") == 1 && f.Count("Plant") == 24, "Final-stage cycle missing");
        });
        await Check("insufficient balance waits naturally across repeated passes", async () => {
            var f = new Fixture { Normal = 6000 }; await f.Run(); f.Clock += 4800; await f.Run(); Require(f.Count("Fertilize") == 0, "Natural-wait decision was lost"); f.Clock += 200; await f.Run(); Require(f.Count("Plant") == 24, "Natural mature cycle missing");
        });
        await Check("ordinary and organic containers fund one complete batch", async () => {
            var f = new Fixture { Normal = 60000, Organic = 60000 }; f.Packs[80001] = 2; var r = await f.Run();
            Require(N(r["farm"]["harvest"], "verified") == 24 && f.Count("Fertilize") == 2 && f.Count("Use") == 0 && f.Count("Purchase") == 0, "Container priority or combined budget failed");
        });
        await Check("unopened fertilizer packs are counted and verified on use", async () => {
            var f = new Fixture { Normal = 110000 }; f.Packs[80003] = 2; var r = await f.Run();
            Require(N(r["farm"]["harvest"], "verified") == 24 && N(f.Requests("Use").Single()["item"], "count") == 1, "Item deficit handling failed");
        });
        await Check("minimum point purchase covers only the missing fertilizer", async () => {
            var f = new Fixture { Normal = 110000, Points = 100 }; f.Products.Add(PointProduct()); var r = await f.Run();
            Require(N(r["farm"]["harvest"], "verified") == 24 && f.Points == 66 && f.Count("Purchase") == 1 && N(f.Requests("Purchase").Single(), "buy_num") == 1, "Point top-up incorrect");
        });
        await Check("point purchases do not happen before the last stage", async () => {
            var f = new Fixture { Normal = 0, Points = 500 }; f.Products.Add(PointProduct()); f.DelayLastGrowth(); var r = await f.Run();
            Require(N(r["fertilizer"], "pointsCost") > 0 && f.Count("Purchase") == 0 && f.Count("Use") == 0, "Premature purchase");
        });
        await Check("accepted purchase without rewards blocks fertilizer", async () => {
            var f = new Fixture { Normal = 110000, Points = 100, NoReward = true }; f.Products.Add(PointProduct()); var r = await f.Run();
            Require(!B(r, "allRequiredComplete") && f.Count("Fertilize") == 0 && f.Count("Plant") == 0, "Unverified rewards promoted to success");
        });
        await Check("accepted item use without increase blocks fertilizer", async () => {
            var f = new Fixture { Normal = 110000, NoUseEffect = true }; f.Packs[80003] = 1; var r = await f.Run();
            Require(!B(r, "allRequiredComplete") && f.Count("Fertilize") == 0, "Unverified container increase accepted");
        });
        await Check("fertilizer box uses the actual returned item duration", async () => {
            var f = new Fixture(); f.Packs[100003] = 1; f.DelayLastGrowth(); var r = await f.Run();
            Require(N(r["fertilizer"], "normalBagSec") == 3600 && N(r["fertilizer"], "unresolvedBoxes") == 0, "Box duration guessed or lost");
        });
        await Check("full fruit warehouse sells all variants before harvest and sells the new crop before planting", async () => {
            var f = new Fixture { Seeds = 24 }; f.MatureAll(); f.Packs[80001] = 5;
            f.Fruits.Add(O(("id", 40102), ("uid", 11), ("count", 999840)));
            f.Fruits.Add(O(("id", 40182), ("uid", 12), ("count", 200), ("mutant_types", A(new long[] { 1, 4 }))));
            f.Fruits.Add(O(("id", 40516), ("uid", 13), ("count", 166)));
            long beforeGold = f.Gold; var r = await f.Run();
            Require(B(r, "allRequiredComplete") && f.Count("Sell") == 2 && f.Count("Plant") == 24, "Full warehouse cycle did not complete");
            Require(f.Fruits.All(i => N(i, "count") == 0) && f.Packs[80001] == 5, "Fruit remained or fertilizer was sold");
            Require(f.Gold - beforeGold == (999840 + 200 + 166 + 24 * 560) * 131L && N(r["account"], "gold") == f.Gold, "Sale gold was not verified or displayed");
            Require(f.Calls.FindIndex(c => c.Method == "Sell") < f.Calls.FindIndex(c => c.Method == "Harvest") &&
                f.Calls.FindLastIndex(c => c.Method == "Sell") < f.Calls.FindIndex(c => c.Method == "Plant"), "Sale ordering did not protect harvest and planting");
            Require(f.Requests("Sell").SelectMany(s => L(s, "items")).All(i => N(i, "id") >= 40000), "Seeds or tools entered a sale");
        });
        await Check("accepted sale without inventory decrease blocks harvest and is not repeated in the same pass", async () => {
            var f = new Fixture { NoSaleEffect = true }; f.MatureAll(); f.Fruits.Add(O(("id", 40102), ("uid", 1), ("count", 999840)));
            var r = await f.Run(); Require(!B(r, "allRequiredComplete") && f.Count("Sell") == 1 && f.Count("Harvest") == 0 && f.Count("Plant") == 0, "Unverified sale allowed harvest or duplicate sale");
        });
        await Check("sale without gold arrival blocks harvest", async () => {
            var f = new Fixture { NoSaleGold = true }; f.MatureAll(); f.Fruits.Add(O(("id", 40102), ("uid", 1), ("count", 999840)));
            var r = await f.Run(); Require(!B(r, "allRequiredComplete") && f.Count("Sell") == 1 && f.Count("Harvest") == 0 && f.Count("Plant") == 0, "Missing gold was treated as success");
        });
        await Check("failed sale of newly harvested fruit blocks planting", async () => {
            var f = new Fixture { NoSaleEffect = true }; f.MatureAll();
            var r = await f.Run(); Require(!B(r, "allRequiredComplete") && f.Count("Harvest") == 1 && f.Count("Sell") == 1 && f.Count("Plant") == 0, "Unverified new-crop sale allowed planting");
        });
        await Check("inspection does not sell fruit or perform harvest and planting", async () => {
            var f = new Fixture(); f.MatureAll(); f.Fruits.Add(O(("id", 40102), ("uid", 1), ("count", 999840)));
            await f.Run(true); Require(f.Count("Sell") == 0 && f.Count("Harvest") == 0 && f.Count("Plant") == 0 && N(f.Fruits[0], "count") == 999840, "Inspection changed fruit inventory");
        });
        await Check("growing batch sells warehouse fruit without disturbing crops", async () => {
            var f = new Fixture(); f.DelayLastGrowth(); f.Fruits.Add(O(("id", 40182), ("uid", 1), ("count", 100), ("mutant_types", A(new long[] { 1 }))));
            await f.Run(); Require(f.Count("Sell") == 1 && f.Count("Harvest") == 0 && f.Count("Plant") == 0 && f.Plots.All(l => P(l, "plant") != null), "Growing batch was disturbed by warehouse sale");
        });
        await Check("mature crops do not show insufficient fertilizer for a zero requirement", () => {
            var s = new Snapshot { HasFertilizerPlan = true, FertNeedSec = 0, FertilizerSufficient = false, Planted = 24 };
            for (int i = 0; i < 24; i++) s.Lands.Add(new LandRow { Id = i + 1, MatureAt = Now - 1 });
            Require(DashboardTheme.FertilizerText(s) == "整批已成熟，无需施肥", "Mature crop fertilizer message is misleading"); return Task.CompletedTask;
        });
        await Check("partial harvest cannot start planting", async () => {
            var f = new Fixture { PartialHarvest = true }; f.MatureAll(); var r = await f.Run(); Require(!B(r, "allRequiredComplete") && f.Count("Plant") == 0, "Partial harvest advanced the batch");
        });
        await Check("rejected harvest cannot start planting", async () => {
            var f = new Fixture { FailMethod = "Harvest" }; f.MatureAll(); var r = await f.Run(); Require(!B(r, "allRequiredComplete") && f.Count("Plant") == 0, "Rejected harvest advanced the batch");
        });
        await Check("unconfirmed seed purchase blocks planting", async () => {
            var f = new Fixture { MissingSeeds = true }; f.MatureAll(); var r = await f.Run(); Require(!B(r, "allRequiredComplete") && f.Count("Plant") == 0, "Missing seeds accepted");
        });
        await Check("existing seeds avoid a duplicate purchase", async () => {
            var f = new Fixture { Seeds = 24 }; f.MatureAll(); await f.Run(); Require(f.Count("BuyGoods") == 0 && f.Count("Plant") == 24, "Owned seeds ignored");
        });
        await Check("a withered batch is erased with RemovePlant and replanted whole", async () => {
            var f = new Fixture { Stealable = true }; f.Wither(); var r = await f.Run();
            Require(f.Count("RemovePlant") == 1 && L(f.Requests("RemovePlant").Single(), "land_ids").Count == 24, "Withered batch was not erased");
            Require(!f.Requests("Harvest").Any(h => S(h, "host_gid") == "self") && f.Count("Plant") == 24 &&
                f.Requests("Plant").All(r => L(L(r, "items").Single(), "land_ids").Count == 1), "Withered batch was harvested or not replanted");
            Require(B(r, "allRequiredComplete") && N(r["farm"]["dead"], "cleared") == 24 && N(r["cropClock"], "deadCount") == 0, "Withered batch cycle was not verified");
        });
        await Check("a mature batch is harvested and never erased", async () => {
            var f = new Fixture(); f.MatureAll(); var r = await f.Run();
            Require(B(r, "allRequiredComplete") && f.Count("RemovePlant") == 0 && N(r["farm"]["harvest"], "verified") == 24, "Mature batch erase guard failed");
        });
        await Check("a partly withered batch waits for the surviving crops", async () => {
            var f = new Fixture { Normal = 0 }; f.CompleteDaily(); f.Wither(6); var r = await f.Run();
            Require(f.Count("RemovePlant") == 0 && f.Count("Harvest") == 0 && f.Count("Plant") == 0, "Partial withering split the batch");
            var checks = r["checks"].AsArray();
            Require(B(r, "allRequiredComplete") && N(r["cropClock"], "deadCount") == 6 &&
                S(checks.First(c => S(c, "id") == "erase-dead"), "status") == "not-due" && S(checks.First(c => S(c, "id") == "final-state"), "status") == "not-due", "Partial withering was not reported as waiting: " + checks.ToJsonString());
            f.Clock += 5000; var second = await f.Run();
            Require(f.Count("RemovePlant") == 1 && L(f.Requests("RemovePlant").Single(), "land_ids").Count == 6, "Withered plots were not erased with the batch reset");
            Require(N(second["farm"]["harvest"], "verified") == 18 && f.Count("Plant") == 24, "Batch reset did not harvest the survivors and replant all 24");
            Require(B(second, "allRequiredComplete"), "Batch reset after partial withering was not verified");
        });
        await Check("an unverified erase blocks the batch reset", async () => {
            var f = new Fixture { EraseNoEffect = true }; f.Wither(); var r = await f.Run();
            Require(!B(r, "allRequiredComplete") && f.Count("Plant") == 0, "Unverified erase advanced the batch");
        });
        await Check("final-stage fertilizer and finished remnants can reset the whole batch in one pass", async () => {
            var f = new Fixture(); f.Wither(6); var r = await f.Run();
            Require(B(r, "allRequiredComplete") && f.Count("Fertilize") == 1 && f.Count("RemovePlant") == 1 &&
                N(r["farm"]["harvest"], "verified") == 18 && f.Count("Plant") == 24, "Fertilized survivors were blocked by finished crop remnants");
        });
        await Check("multi-season harvest sells fruit, waits for regrowth, clears final remnants and replants all 24", async () => {
            var f = new Fixture { MultiSeason = true, Normal = 0, Seeds = 24 }; f.MatureAll();
            for (int i = 0; i < 7; i++) f.Plots[i]["plant"]["season"] = 2;
            var first = await f.Run();
            Require(B(first, "allRequiredComplete") && N(first["farm"]["harvest"], "verified") == 24 &&
                N(first["cropClock"], "deadCount") == 7 && f.Count("Plant") == 0 && f.Count("RemovePlant") == 0, "Harvested regrowth was erased, replanted early or treated as a failure");
            var wait = await f.Run();
            Require(B(wait, "allRequiredComplete") && f.Count("Harvest") == 1 && f.Count("Plant") == 0, "Waiting for regrowth repeated a harvest");
            f.Clock += 10001; var second = await f.Run();
            Require(B(second, "allRequiredComplete") && f.Count("Harvest") == 2 && f.Count("RemovePlant") == 2 && f.Count("Plant") == 24, "Final-season remnants blocked a complete reset");
            Require(f.Fruits.All(i => N(i, "count") == 0) && N(second["cropClock"], "deadCount") == 0, "Fruit or final-season remnants remained after reset");
        });
        await Check("missing land list is not treated as the whole farm", async () => {
            var f = new Fixture(); f.Plots.RemoveAt(23); var r = await f.Run(); Require(!B(r, "allRequiredComplete") && f.Count("Plant") == 0 && f.Count("Fertilize") == 0, "Incomplete batch accepted");
        });
        await Check("one friend harvest completes daily while own 24 remain growing", async () => {
            var f = new Fixture { Normal = 0, Stealable = true }; var r = await f.Run(); Require(B(r, "allRequiredComplete") && f.Count("Harvest") == 1 && S(f.Requests("Harvest").Single(), "host_gid") == "friend" && f.Count("Plant") == 0, "Friend daily route failed");
        });
        await Check("accepted friend harvest without progress is not repeated", async () => {
            var f = new Fixture { Normal = 0, Stealable = true, HarvestNoProgress = true }; var r = await f.Run(); Require(!B(r, "allRequiredComplete") && f.Count("Harvest") == 1, "Friend harvest repeated or falsely verified");
        });
        await Check("refreshed daily runs without disturbing the growing batch", async () => {
            var f = new Fixture { Stealable = true }; await f.Run(); f.RefreshDaily(); var r = await f.Run(); Require(N(r["daily"], "claimed") == 3 && f.Count("Plant") == 24 && f.Count("Harvest") == 2, "Refreshed tasks broke the growing batch");
        });
        await Check("inspection performs no gameplay writes", async () => {
            var f = new Fixture { Stealable = true }; f.Packs[100003] = 1; f.Wither(); var r = await f.Run(true);
            Require(!B(r, "allRequiredComplete") && !f.Calls.Any(c => new[] { "Harvest", "Plant", "RemovePlant", "BuyGoods", "Use", "Purchase", "Enter", "WaterLand", "BatchClaimTaskReward", "Fertilize" }.Contains(c.Method)), "Inspection wrote game state");
        });
        await Check("missing daily tasks remain unverified", async () => { var r = await new Fixture { HideDaily = true }.Run(); Require(!B(r, "allRequiredComplete"), "Missing daily tasks passed"); });
        await Check("a free product this account cannot claim does not block the verified day", async () => {
            var f = new Fixture { VipProductUnavailable = true }; var r = await f.Run();
            Require(B(r, "allRequiredComplete"), "Membership-only free product blocked the day");
            var vip = L(r, "freeProducts").FirstOrDefault(p => S(p, "id") == "1053");
            Require(S(vip, "state") == "not-applicable", "Unclaimable membership product was not excluded");
            Require(S(L(r, "checks").FirstOrDefault(c => S(c, "id") == "free-fertilizer"), "status") == "passed", "Claimable fertilizer was dropped");
            Require(S(L(r, "checks").FirstOrDefault(c => S(c, "id") == "free-benefits"), "status") == "passed", "Daily free benefits were lost");
            Require(f.Count("Purchase") == 0, "Inspection bought an unclaimable product");
        });
        await Check("per-plot allocation cannot overdraw a fertilizer container", () => { Require(FertilizerBudget.Allocate(new long[] { 5000, 5000 }, 6000, 4000) == null, "Invalid allocation accepted"); return Task.CompletedTask; });
        await Check("the point wallet is shared by ordinary and organic offers", () => {
            var f = new Fixture { Normal = 0, Points = 34 }; var offers = FertilizerBudget.Offers(new[] { PointProduct() }, f.Clock);
            var plan = FertilizerBudget.Plan(f.Plots, f.Clock, FertilizerStock.FromBag(O(("virtual_items", A(new[] { O(("id", 1002), ("count", 34)) }))), f.Clock), offers);
            Require(!plan.Sufficient && plan.Purchases.Count == 0, "Point balance counted more than once"); return Task.CompletedTask;
        });
        await Check("loopback host handles code and correlated bridge/crypto jobs in C#", async () => {
            using var host = new FarmBridgeHost(0); using var http = new HttpClient { BaseAddress = new Uri("http://127.0.0.1:" + host.Port), Timeout = TimeSpan.FromSeconds(5) };
            async Task<JsonNode> Post(string path, JsonObject data) { using var r = await http.PostAsync(path, new StringContent(data.ToJsonString(), System.Text.Encoding.UTF8, "application/json")); r.EnsureSuccessStatusCode(); return JsonNode.Parse(await r.Content.ReadAsStringAsync()); }
            var health = JsonNode.Parse(await http.GetStringAsync("/health")); Require(S(health, "runtime") == "csharp", "Host runtime mismatch");
            Require(!B(await Post("/host-ready", new()), "active"), "Legacy unverified bridge registered");
            await Post("/code", O(("code", "legacy-code"))); Require(S(JsonNode.Parse(await http.GetStringAsync("/code")), "code") == "", "Legacy page replaced code");
            Require(B(await Post("/host-ready", O(("hostId", "verified-page"), ("version", 2), ("cryptoReady", true))), "active"), "Verified bridge did not register");
            Require(!B(await Post("/host-ready", O(("hostId", "other-page"), ("version", 2), ("cryptoReady", true))), "active"), "A second page replaced the active bridge");
            await Post("/code", O(("code", "native-test-only"), ("hostId", "verified-page"))); Require(S(JsonNode.Parse(await http.GetStringAsync("/code")), "code") == "native-test-only", "Memory code transport failed");
            await Post("/code", O(("code", "wrong-page-code"), ("hostId", "other-page"))); Require(S(JsonNode.Parse(await http.GetStringAsync("/code")), "code") == "native-test-only", "Inactive page replaced code");
            foreach (bool crypto in new[] { false, true }) {
                var pending = Post(crypto ? "/crypto-task" : "/bridge", crypto ? O(("op", "e"), ("b64", "AQ==")) : O(("op", "inspect"), ("path", "itempb.UseRequest")));
                JsonNode job = null;
                string endpoint = crypto ? "/crypto-task" : "/bridge-task";
                Require(S(JsonNode.Parse(await http.GetStringAsync(endpoint)), "id") == "", "Legacy page consumed a bridge job");
                Require(S(JsonNode.Parse(await http.GetStringAsync(endpoint + "?hostId=other-page")), "id") == "", "Inactive page consumed a bridge job");
                for (int i = 0; i < 100; i++) { job = JsonNode.Parse(await http.GetStringAsync(endpoint + "?hostId=verified-page")); if (S(job, "id").Length > 0) break; await Task.Delay(10); }
                Require(S(job, "id").Length > 0, "Bridge job missing");
                await Post(crypto ? "/crypto-result" : "/bridge-result", O(("id", S(job, "id")), ("hostId", "other-page"), ("b64", "Aw==")));
                Require(!pending.IsCompleted, "Inactive page completed a bridge job");
                await Post(crypto ? "/crypto-result" : "/bridge-result", O(("id", S(job, "id")), ("hostId", "verified-page"), ("b64", "Ag=="), ("value", O(("ok", true)))));
                var result = await pending; Require(crypto ? S(result, "b64") == "Ag==" : B(result["value"], "ok"), "Bridge correlation failed");
            }
        });
        await Check("bootstrap patch is limited to farm outputs and keeps an original backup", () => {
            string temp = Path.Combine(FarmPaths.Artifacts, "native-bootstrap-test", Guid.NewGuid().ToString("N"));
            string lib = Path.Combine(temp, "miniapp_jslib", "test"), farm = Path.Combine(temp, "miniapp_src", "1112386029_3_test");
            Directory.CreateDirectory(lib); Directory.CreateDirectory(farm); string template = Path.Combine(lib, "QPageFrame.html");
            string original = "<html><body>fixture</body></html><script>/*_M0_CODESVC_*/legacyLoginTimer()</script>";
            File.WriteAllText(template, original); File.WriteAllText(Path.Combine(farm, "out_page-frame.html"), "<body>farm</body>");
            Require(QqBootstrap.Install(temp).Count == 2 && QqBootstrap.Install(temp).Count == 0, "Bootstrap not idempotent");
            Require(!File.ReadAllText(template).Contains("_M0_CODESVC_"), "Legacy login timer was retained");
            Require(File.ReadAllText(template + ".bootbak") == original, "Original backup lost"); return Task.CompletedTask;
        });
        SchedulePolicy.SelfTest();
        Save(Path.Combine(FarmPaths.Artifacts, "native-self-test.json"), O(("runtime", "csharp"), ("checkedAt", DateTimeOffset.UtcNow.ToString("O")), ("checks", count), ("schedulerChecks", 15), ("passed", true), ("cases", names)));
        Console.WriteLine(count + " native C# checks passed; 15 scheduler checks passed.");
    }
}
