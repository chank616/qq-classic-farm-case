using System.Text.Json.Nodes;
using static FarmTray.Native.JsonData;

namespace FarmTray.Native;

internal sealed class FarmWorkflow
{
    private readonly FarmRpc _rpc;
    private readonly JsonObject _basic;
    private readonly long _scene;
    private readonly bool _dry;
    private readonly int _batchSize;
    private readonly Action<JsonObject> _emit;
    private readonly Func<long> _now;
    private readonly CancellationToken _token;
    private readonly JsonArray _checks = new(), _operations = new();
    private readonly JsonObject _report;
    private List<JsonNode> _current = new();
    private List<long> _mallSlots;
    private JsonNode _naturalDecision;
    private bool _fruitSaleFailed;
    private static readonly JsonObject FruitCatalog = JsonNode.Parse(FarmPaths.Resource("fruit-catalog.json"))["items"].AsObject();
    private string Gid => S(_basic, "gid");
    internal FarmWorkflow(FarmRpc rpc, JsonObject basic, long scene, bool dry = false, Action<JsonObject> emit = null,
        Func<long> now = null, JsonNode previousDecision = null, int batchSize = 24, CancellationToken token = default)
    {
        _rpc = rpc; _basic = basic; _scene = scene; _dry = dry; _emit = emit ?? (_ => { }); _now = now ?? (() => Now);
        _naturalDecision = Copy(previousDecision); _batchSize = batchSize; _token = token;
        _report = O(("schemaVersion", 1), ("runtime", "csharp"), ("day", Day(_now())), ("mode", dry ? "inspection" : "execute"),
            ("startedAt", DateTimeOffset.UtcNow.ToString("O")), ("account", O(("gid", Gid), ("name", S(basic, "name")), ("level", N(basic, "level")))),
            ("allRequiredComplete", false), ("completed", false));
    }
    private static string Service(string name) => "gamepb." + (name switch {
        "plant" => "plantpb.PlantService", "task" => "taskpb.TaskService", "item" => "itempb.ItemService", "shop" => "shoppb.ShopService",
        "vip" => "qqvippb.QQVipService", "mall" => "mallpb.MallService", "friend" => "friendpb.FriendService", "visit" => "visitpb.VisitService", _ => name });
    private Task<JsonObject> Read(string service, string method, JsonObject value = null) { _token.ThrowIfCancellationRequested(); return _rpc(Service(service), method, value ?? new()); }
    private void Check(string id, string status, object detail) => _checks.Add(O(("id", id), ("status", status), ("detail", detail)));
    private async Task Stage(string id, Func<Task> action)
    {
        _token.ThrowIfCancellationRequested();
        try { await action(); } catch (OperationCanceledException) { throw; } catch (Exception error) { Check(id, "failed", error.Message); }
    }
    private async Task<JsonObject> Act(string service, string method, JsonObject value)
    {
        _token.ThrowIfCancellationRequested();
        if (_dry) { _operations.Add(O(("method", method), ("status", "would-run"))); return null; }
        var op = O(("method", method), ("err", 0), ("status", "server-accepted"), ("msg", ""));
        if (method == "Use") { op["itemId"] = N(value["item"], "id"); op["count"] = N(value["item"], "count"); }
        if (method == "Purchase") { op["productId"] = N(value, "id"); op["count"] = N(value, "buy_num"); }
        if (method == "Fertilize") { op["fertilizerId"] = N(value, "fertilizer_id"); op["landIds"] = Copy(value["land_ids"]); }
        if (method == "Sell") op["items"] = Copy(value["items"]);
        try { var result = await Read(service, method, value); _operations.Add(op); _emit(O(("type", "operation-detail"), ("method", method), ("status", "server-accepted"))); return result; }
        catch (OperationCanceledException) { throw; }
        catch (Exception error) { op["status"] = "failed"; op["msg"] = error.Message; op["err"] = -1; _operations.Add(op); throw; }
    }
    private async Task<List<JsonNode>> Lands()
    {
        var plots = L(await Read("plant", "AllLands", O(("host_gid", Gid))), "lands").Where(l => B(l, "unlocked")).ToList();
        if (plots.Count != _batchSize || plots.Select(l => N(l, "id")).Distinct().Count() != _batchSize) throw new IOException("Whole-farm batch requires " + _batchSize + " distinct lands; server returned " + plots.Count);
        return plots;
    }
    private async Task<FertilizerStock> Stock() => FertilizerStock.FromBag(await Read("item", "GetBag", O(("global_scene_id", _scene), ("tab_id", 0))), _now());
    private async Task<Dictionary<long, long>> Bag(long tab)
    {
        var bag = await Read("item", "GetBag", O(("global_scene_id", _scene), ("tab_id", tab)));
        return L(bag, "physical_items").Concat(L(bag, "virtual_items")).GroupBy(i => N(i, "id")).ToDictionary(g => g.Key, g => g.Sum(i => N(i, "count")));
    }
    private static List<JsonNode> FruitStacks(JsonNode bag) => L(bag, "physical_items")
        .Where(i => FruitCatalog.ContainsKey(S(i, "id")) && N(i, "count") > 0).ToList();
    private async Task SellFruits(string phase)
    {
        if (_fruitSaleFailed) throw new IOException("上一次果实出售未通过复核，等待下轮检查");
        var request = O(("global_scene_id", _scene), ("tab_id", 0));
        var before = await Read("item", "GetBag", request);
        var fruit = FruitStacks(before);
        if (fruit.Count == 0) return;
        if (fruit.Any(i => B(i, "is_locked"))) throw new IOException("果实已锁定，服务器不允许出售；请先解除锁定");
        if (fruit.Any(i => N(i, "uid") <= 0)) throw new IOException("果实缺少库存标识，无法确认出售对象");
        long beforeGold = L(before, "virtual_items").Where(i => N(i, "id") == 1001).Sum(i => N(i, "count"));
        var items = fruit.Select(i => O(("id", N(i, "id")), ("uid", N(i, "uid")), ("count", N(i, "count")))).ToList();
        var detail = O(("phase", phase), ("stacks", items.Count), ("count", items.Sum(i => N(i, "count"))), ("includesVariants", true));
        if (!_dry) _fruitSaleFailed = true;
        var reply = await Act("item", "Sell", O(("items", A(items))));
        if (_dry) { Check("fruit-sale-" + phase, "unverified", detail); return; }
        var after = await Read("item", "GetBag", request);
        foreach (var item in items) {
            long left = L(after, "physical_items").Where(i => N(i, "id") == N(item, "id") && N(i, "uid") == N(item, "uid")).Sum(i => N(i, "count"));
            if (left != 0) throw new IOException("果实出售未通过库存复核，停止收获补种");
        }
        long afterGold = L(after, "virtual_items").Where(i => N(i, "id") == 1001).Sum(i => N(i, "count"));
        long rewardGold = L(reply, "get_items").Where(i => N(i, "id") == 1001).Sum(i => N(i, "count"));
        if (afterGold <= beforeGold || rewardGold > 0 && afterGold - beforeGold != rewardGold)
            throw new IOException("果实出售未通过金币到账复核，停止收获补种");
        detail["goldAdded"] = afterGold - beforeGold;
        if (_report["fruitSales"] is not JsonArray sales) { sales = new(); _report["fruitSales"] = sales; }
        sales.Add(detail.DeepClone());
        _basic["gold"] = afterGold;
        _fruitSaleFailed = false;
        Check("fruit-sale-" + phase, "passed", detail);
    }
    private async Task<List<FertilizerOffer>> Offers()
    {
        if (_mallSlots == null) {
            _mallSlots = L(await Read("mall", "GetMallProfiles", O(("global_scene_id", _scene))), "mall_profiles").Select(p => N(p, "mall_type")).Where(n => n > 0).Distinct().ToList();
            if (_mallSlots.Count == 0) _mallSlots.AddRange(new long[] { 1, 4, 5 });
        }
        var products = new List<JsonNode>();
        foreach (long slot in _mallSlots) products.AddRange(L(await Read("mall", "GetMallListBySlotType", O(("slot_type", slot), ("global_scene_id", _scene), ("is_manual_open", false))), "products"));
        return FertilizerBudget.Offers(products, _now());
    }
    private async Task<FertilizerStock> UseItem(JsonNode item, long count)
    {
        var before = await Stock(); long id = N(item, "id"), uid = N(item, "uid");
        await Act("item", "Use", O(("item", O(("id", id), ("uid", uid), ("count", count))), ("target", O(("host_gid", Gid)))));
        if (_dry) return before;
        var after = await Stock(); long remaining = after.Physical.Where(i => N(i, "id") == id && N(i, "uid") == uid).Sum(i => N(i, "count"));
        if (remaining > N(item, "count") - count) throw new IOException("Used fertilizer item did not decrease on bag recheck");
        if (FertilizerBudget.Items.TryGetValue(id, out var p) && after.Bucket[p.Type] - before.Bucket[p.Type] != p.Seconds * count)
            throw new IOException("Fertilizer container increase was not verified");
        return after;
    }
    private string CycleKey() => string.Join('|', _current.Where(l => P(l, "plant") != null).OrderBy(l => N(l, "id"))
        .Select(l => N(l, "id") + ":" + N(l["plant"], "id") + ":" + FarmCrop.Mature(l["plant"])));
    private FertilizerPlan RespectWait(FertilizerPlan plan)
    {
        string key = CycleKey();
        if (S(_naturalDecision, "cycleKey") == key && B(_naturalDecision, "waitNatural")) {
            plan.Sufficient = false; plan.Ready = false; plan.WaitNatural = true; plan.Purchases.Clear(); plan.PointsCost = 0;
        } else if (plan.PhaseAt > 0 && plan.PhaseAt <= _now() && !plan.Sufficient) {
            _naturalDecision = O(("cycleKey", key), ("waitNatural", true), ("decidedAt", _now())); plan.WaitNatural = true;
        } else if (S(_naturalDecision, "cycleKey") != key) _naturalDecision = null;
        return plan;
    }
    internal static bool NeedsCare(JsonNode land, string method)
    {
        var plant = P(land, "plant"); if (plant == null) return false;
        return method == "WaterLand" ? N(plant, "dry_num") > 0 : L(plant, method == "WeedOut" ? "weed_owners" : "insect_owners").Count > 0;
    }
    internal static List<JsonNode> AllTasks(JsonNode info) => L(info, "tasks").Concat(L(info, "daily_tasks")).Concat(L(info, "growth_tasks")).GroupBy(t => S(t, "id")).Select(g => g.Last()).ToList();
    internal static List<JsonNode> DailyTasks(JsonNode info)
    {
        var ids = L(info, "daily_tasks").Select(t => S(t, "id")).ToHashSet(); return AllTasks(info).Where(t => N(t, "task_type") == 2 || ids.Contains(S(t, "id"))).ToList();
    }
    private static JsonObject TaskView(JsonNode t) => O(("id", S(t, "id")), ("desc", S(t, "desc")), ("cond", N(t, "cond_type")),
        ("progress", N(t, "progress")), ("total", N(t, "total_progress")), ("claimed", B(t, "is_claimed")), ("unlocked", B(t, "is_unlocked")));
    private async Task<JsonNode> TaskInfo() => P(await Read("task", "TaskInfo", O(("global_scene_id", _scene))), "task_info") ?? throw new IOException("TaskInfo contains no task_info");
    internal async Task<JsonObject> Run()
    {
        Check("login", "passed", "Login and PlayerLogin accepted by server");
        await Stage("task-discovery", async () => {
            var info = await TaskInfo(); _report["tasksBefore"] = A(AllTasks(info).Select(TaskView));
        });
        await Stage("farm", Farm);
        await Stage("daily-tasks", Daily);
        await Stage("fruit-sale", () => SellFruits("after-daily"));
        await Stage("vip-daily", VipDaily);
        await Stage("vip-rewards", VipRewards);
        await Stage("free-fertilizer", FreeBenefits);
        await Stage("final-state", FinalState);
        _report["completed"] = true; _report["finishedAt"] = DateTimeOffset.UtcNow.ToString("O");
        _report["fertilizerDecisionState"] = Copy(_naturalDecision);
        bool complete = !_dry && _checks.Count > 0 && _checks.All(c => S(c, "status") is "passed" or "not-due" or "not-applicable") && B(_report["daily"], "complete");
        _report["allRequiredComplete"] = complete; _report["status"] = _dry ? "inspection-only" : complete ? "verified" : "incomplete";
        _report["checks"] = _checks; _report["operations"] = _operations; return _report;
    }
    private async Task Farm()
    {
        _current = await Lands();
        long time = _now();
        var occupied = _current.Where(l => P(l, "plant") != null).ToList();
        var dead = occupied.Where(l => FarmCrop.Dead(l["plant"], time)).ToList();
        // Whole-batch rule: 枯死地块只在整批重置时一起铲除，部分枯死仍等存活作物到期。
        int deadCleared = 0, deadFound = dead.Count;
        async Task ClearDead()
        {
            var pending = _current.Where(l => P(l, "plant") != null && FarmCrop.Dead(l["plant"], _now())).ToList();
            if (pending.Count == 0) return;
            bool growing = _current.Any(l => P(l, "plant") != null && !FarmCrop.Dead(l["plant"], _now()) && !FarmCrop.Ripe(l["plant"], _now()));
            if (growing) { Check("erase-dead", "not-due", O(("dead", pending.Count), ("reason", "wait-for-whole-batch"))); return; }
            var ids = pending.Select(l => N(l, "id")).ToList();
            if (_dry) { Check("erase-dead", "unverified", O(("dead", pending.Count), ("landIds", A(ids)))); return; }
            await Act("plant", "RemovePlant", O(("land_ids", A(ids))));
            _current = await Lands();
            var left = _current.Count(l => ids.Contains(N(l, "id")) && P(l, "plant") != null);
            if (left > 0) throw new IOException("枯死作物铲除未通过服务端复核：" + left + " 块仍有作物");
            deadCleared += ids.Count;
            Check("erase-dead", "passed", O(("dead", pending.Count), ("cleared", ids.Count)));
        }
        if (dead.Count > 0) await Stage("erase-dead", ClearDead);
        foreach (string method in new[] { "WaterLand", "WeedOut", "Insecticide" }) {
            var targets = _current.Where(l => P(l, "plant") != null && !FarmCrop.Dead(l["plant"], _now()) && NeedsCare(l, method)).ToList(); if (targets.Count == 0) continue;
            await Act("plant", method, O(("land_ids", A(targets.Select(l => N(l, "id")))), ("host_gid", Gid), ("host_type", 0), ("reason", 0)));
            if (!_dry) { _current = await Lands(); Check("care-" + method, targets.All(t => !NeedsCare(_current.FirstOrDefault(l => N(l, "id") == N(t, "id")), method)) ? "passed" : "failed", O(("attempted", targets.Count))); }
        }
        var stock = await Stock();
        if (!_dry && stock.Boxes.Count > 0) await Stage("fertilizer-unpack", async () => {
            foreach (var box in stock.Boxes) stock = await UseItem(box, N(box, "count"));
            Check("fertilizer-unpack", "passed", "Fertilizer boxes opened and inventory re-read");
        });
        stock = await Stock();
        var catalogue = await Read("shop", "ShopInfo", O(("shop_id", 2)));
        var candidates = L(catalogue, "goods_list").Where(g => B(g, "unlocked")).Select(g => new {
            Goods = g, Levels = L(g, "conds").Where(c => N(c, "type") == 1).Select(c => N(c, "param")).ToList()
        }).Where(g => g.Levels.Count > 0 && g.Levels.Max() <= N(_basic, "level")).OrderByDescending(g => g.Levels.Max()).ThenBy(g => N(g.Goods, "id")).ToList();
        if (candidates.Count == 0) throw new IOException("No seed with verified level condition is available");
        var best = candidates[0].Goods;
        _report["selectedSeed"] = O(("id", N(best, "item_id")), ("goodsId", N(best, "id")), ("requiredLevel", candidates[0].Levels.Max()));
        Check("seed-selection", "passed", _report["selectedSeed"]);
        var supply = RespectWait(FertilizerBudget.Plan(_current, _now(), stock, await Offers())); _report["fertilizerDecision"] = supply.Json();
        if (_current.Any(l => P(l, "plant") != null && FarmCrop.Mature(l["plant"]) > _now())) {
            _emit(O(("type", "fert-budget"), ("needSec", supply.NeedSec), ("haveSec", supply.OwnedTotalSec)));
            if (supply.Ready) {
                if (_dry) {
                    foreach (var g in supply.Groups) await Act("plant", "Fertilize", O(("land_ids", A(g.Lands)), ("fertilizer_id", g.Id)));
                    Check("fertilize", "unverified", "Inspection did not purchase, unpack, or fertilize");
                } else {
                    foreach (var purchase in supply.Purchases) {
                        var before = stock; var offer = purchase.Offer;
                        var result = await Act("mall", "Purchase", O(("id", offer.Id), ("buy_num", purchase.Count))); stock = await Stock();
                        if (!B(result, "success") || before.Points - stock.Points != offer.Price * purchase.Count ||
                            stock.Bucket[1011] + stock.Packed[1011] - before.Bucket[1011] - before.Packed[1011] < offer.NormalSec * purchase.Count ||
                            stock.Bucket[1012] + stock.Packed[1012] - before.Bucket[1012] - before.Packed[1012] < offer.OrganicSec * purchase.Count)
                            throw new IOException("Point fertilizer purchase not verified by currency and inventory");
                    }
                    var owned = FertilizerBudget.Plan(_current, _now(), stock); if (!owned.Sufficient) throw new IOException("Whole-batch fertilizer is insufficient after purchase");
                    foreach (var g in owned.Groups) {
                        long missing = g.NeedSec - stock.Bucket[g.Id];
                        while (missing > 0) {
                            var packs = stock.Physical.Where(i => FertilizerBudget.Items.TryGetValue(N(i, "id"), out var pack) && pack.Type == g.Id).OrderByDescending(i => FertilizerBudget.Items[N(i, "id")].Seconds).ToList();
                            var item = packs.FirstOrDefault(i => FertilizerBudget.Items[N(i, "id")].Seconds <= missing) ?? packs.LastOrDefault();
                            if (item == null) throw new IOException("No usable fertilizer item covers the verified deficit");
                            long duration = FertilizerBudget.Items[N(item, "id")].Seconds;
                            stock = await UseItem(item, Math.Min(N(item, "count"), (missing + duration - 1) / duration)); missing = g.NeedSec - stock.Bucket[g.Id];
                        }
                    }
                    var ready = FertilizerBudget.Plan(_current, _now(), stock.ContainersOnly()); if (!ready.Ready) throw new IOException("Whole-batch fertilizer containers are not ready");
                    foreach (var g in ready.Groups) await Act("plant", "Fertilize", O(("land_ids", A(g.Lands)), ("fertilizer_id", g.Id)));
                    _current = await Lands(); bool verified = FarmCrop.Ready(_current.Where(l => P(l, "plant") != null && !FarmCrop.Dead(l["plant"], _now())), _now());
                    Check("fertilize", verified ? "passed" : "failed", O(("lands", ready.Groups.Sum(g => g.Lands.Count)), ("wholeBatchMature", verified)));
                }
            } else Check("fertilize", "not-due", O(("reason", supply.Sufficient ? "wait-for-whole-batch-final-stage" : "wait-for-natural-maturity"),
                ("needSec", supply.NeedSec), ("ownedSec", supply.OwnedTotalSec), ("pointsCost", supply.PointsCost), ("batchFertilizeAt", supply.BatchFertilizeAt)));
        }
        // Fertilizer may have made all surviving plots ripe in this same pass.
        if (_current.Any(l => P(l, "plant") != null && FarmCrop.Dead(l["plant"], _now())) &&
            FarmCrop.Ready(_current.Where(l => P(l, "plant") != null && !FarmCrop.Dead(l["plant"], _now())), _now())) await ClearDead();
        int harvested = 0, harvestedVerified = 0, planted = 0, plantedVerified = 0;
        if (FarmCrop.Ready(_current, _now())) {
            await SellFruits("before-harvest");
            var mature = _current.Where(l => P(l, "plant") != null).Select(l => N(l, "id")).ToList(); harvested = mature.Count;
            await Act("plant", "Harvest", O(("land_ids", A(mature)), ("host_gid", Gid), ("is_all", false), ("host_type", 0), ("reason", 0)));
            if (!_dry) { _current = await Lands(); harvestedVerified = mature.Count(id => _current.Any(l => N(l, "id") == id && (P(l, "plant") == null || !FarmCrop.Ripe(l["plant"], _now())))); }
            Check("harvest", _dry ? "unverified" : harvestedVerified == harvested ? "passed" : "failed", O(("attempted", harvested), ("verified", harvestedVerified)));
            if (!_dry && harvestedVerified != harvested) throw new IOException("Whole-batch harvest is not verified; do not start planting");
            await SellFruits("after-harvest");
            // Multi-season crops regrow until their last harvest, then become
            // phase-7 remnants. Reset only when the whole batch has finished.
            if (!_dry) {
                var finished = _current.Where(l => P(l, "plant") != null && FarmCrop.Dead(l["plant"], _now())).ToList();
                bool continuing = _current.Any(l => P(l, "plant") != null && !FarmCrop.Dead(l["plant"], _now()));
                if (finished.Count > 0 && !continuing) {
                    var ids = finished.Select(l => N(l, "id")).ToList();
                    await Act("plant", "RemovePlant", O(("land_ids", A(ids))));
                    _current = await Lands();
                    if (_current.Any(l => ids.Contains(N(l, "id")) && P(l, "plant") != null))
                        throw new IOException("收获后的残株清理未通过服务端复核，停止补种");
                    deadCleared += finished.Count; deadFound += finished.Count;
                    Check("erase-after-harvest", "passed", O(("cleared", finished.Count)));
                }
            }
        } else Check("harvest", "not-due", "Waiting for the entire batch to mature");
        var empty = _current.Where(l => P(l, "plant") == null).ToList();
        if (empty.Count == _current.Count) {
            long seed = N(best, "item_id"), owned = (await Bag(3)).GetValueOrDefault(seed), shortage = Math.Max(0, empty.Count - owned);
            if (shortage > 0) {
                long packSize = Math.Max(1, N(best, "item_count"));
                await Act("shop", "BuyGoods", O(("goods_id", N(best, "id")), ("num", (shortage + packSize - 1) / packSize), ("price", N(best, "price")), ("auto_add", true)));
                if (!_dry && (await Bag(3)).GetValueOrDefault(seed) < empty.Count) throw new IOException("Purchased seeds are insufficient on bag recheck");
            }
            planted = empty.Count;
            var targetIds = empty.Select(l => N(l, "id")).ToList();
            if (_dry) Check("replant", "unverified", O(("attempted", planted), ("seedId", seed)));
            else {
                // 实测（2026-10-19 真实服务端）：每条 PlantItem 只能带一块地，24 块地同发返回
                // 1000020 请求参数错误；逐块播种，失败地块再补试一次，最后统一复核。
                var pending = new List<long>(targetIds);
                for (int round = 0; round < 2 && pending.Count > 0; round++) {
                    var failed = new List<long>();
                    foreach (long id in pending) {
                        try { await Act("plant", "Plant", O(("items", A(new[] { O(("seed_id", seed), ("land_ids", A(new[] { id }))) })))); }
                        catch (OperationCanceledException) { throw; }
                        catch (Exception) { failed.Add(id); }
                    }
                    pending = failed;
                }
                _current = await Lands();
                plantedVerified = targetIds.Count(id => _current.Any(l => N(l, "id") == id && P(l, "plant") != null && N(l["plant"], "id") == 1000000 + seed));
                Check("replant", plantedVerified == planted ? "passed" : "failed",
                    O(("attempted", planted), ("verified", plantedVerified), ("seedId", seed), ("unplanted", A(pending))));
            }
        } else Check("replant", "not-due", "Waiting for the whole batch to be harvested");
        _report["farm"] = O(("mode", "whole-farm"), ("harvest", O(("attempted", harvested), ("verified", harvestedVerified))),
            ("planted", O(("attempted", planted), ("verified", plantedVerified))), ("dead", O(("found", deadFound), ("cleared", deadCleared))),
            ("totalLands", _current.Count), ("occupied", _current.Count(l => P(l, "plant") != null)));
        if (planted > 0 && !_dry && _current.Any(l => P(l, "plant") == null)) throw new IOException("Whole-batch planting is not verified");
    }

    private async Task Daily()
    {
        var info = await TaskInfo(); var daily = DailyTasks(info);
        if (daily.Count < 3) Check("daily-tasks", "pending", "Server did not return three daily tasks");
        List<JsonNode> friends = null;
        async Task<List<JsonNode>> Friends() {
            if (friends != null) return friends;
            var gids = L(await Read("friend", "GetBriefInfo", O(("global_scene_id", _scene))), "friend_gids");
            friends = gids.Count > 0 ? L(await Read("friend", "GetGameFriends", O(("friend_gids", A(gids)), ("global_scene_id", _scene))), "friends") : new(); return friends;
        }
        var picking = daily.FirstOrDefault(t => N(t, "cond_type") == 17 && !B(t, "is_claimed") && N(t, "progress") < N(t, "total_progress"));
        if (picking != null && !_dry) {
            bool accepted = false, verified = false;
            var attempts = new JsonArray();
            var candidates = (await Friends()).Where(f => !B(f, "is_banned") && S(f, "gid") != Gid &&
                (N(f["plant"], "steal_plant_num") > 0 || N(f["plant"], "ripe_time_sec") > 0 && N(f["plant"], "ripe_time_sec") <= _now()))
                .OrderByDescending(f => N(f["plant"], "steal_plant_num")).Take(20);
            foreach (var friend in candidates) {
                string host = S(friend, "gid"); long hostType = N(friend, "host_type");
                var entered = await Act("visit", "Enter", O(("host_gid", host), ("host_type", hostType), ("reason", 0)));
                try {
                    var land = L(entered, "lands").FirstOrDefault(l => B(l["plant"], "stealable") && N(l["plant"], "left_fruit_num") > 0 && !FarmCrop.Dead(l["plant"], _now()) && FarmCrop.Mature(l["plant"]) > 0 && FarmCrop.Mature(l["plant"]) <= _now());
                    if (land == null) continue;
                    try {
                        await Act("plant", "Harvest", O(("host_gid", host), ("host_type", hostType), ("land_ids", A(new[] { N(land, "id") })), ("is_all", false), ("reason", 0)));
                        accepted = true; info = await TaskInfo(); var task = AllTasks(info).FirstOrDefault(t => S(t, "id") == S(picking, "id"));
                        verified = task != null && N(task, "progress") >= N(task, "total_progress");
                        _report["friendHarvest"] = O(("host", host), ("land", N(land, "id")), ("taskProgressVerified", verified));
                    } catch (IOException error) when (error.Message.StartsWith("Harvest:")) { attempts.Add(O(("host", host), ("error", error.Message))); }
                } finally { await Act("visit", "Leave", O(("host_gid", host), ("host_type", hostType))); }
                if (accepted) break;
            }
            Check("friend-harvest", verified ? "passed" : "pending", O(("accepted", accepted), ("taskProgressVerified", verified), ("attempts", attempts)));
        }
        var interaction = DailyTasks(info).FirstOrDefault(t => N(t, "cond_type") == 18 && !B(t, "is_claimed") && N(t, "progress") < N(t, "total_progress"));
        if (interaction != null) {
            bool progressed = false; var list = await Friends();
            foreach (var friend in list.Where(f => !B(f, "is_banned")).OrderByDescending(f => N(f["plant"], "dry_num") + N(f["plant"], "weed_num") + N(f["plant"], "insect_num")).Take(20)) {
                string host = S(friend, "gid"); if (host.Length == 0 || host == Gid) continue; long hostType = N(friend, "host_type");
                var entered = await Act("visit", "Enter", O(("host_gid", host), ("host_type", hostType), ("reason", 0)));
                try {
                    foreach (string method in new[] { "WaterLand", "WeedOut", "Insecticide" }) {
                        var ids = L(entered, "lands").Where(l => NeedsCare(l, method)).Take(1).Select(l => N(l, "id")).ToList(); if (ids.Count == 0) continue;
                        await Act("plant", method, O(("host_gid", host), ("host_type", hostType), ("land_ids", A(ids)), ("reason", 0)));
                        if (!_dry) { info = await TaskInfo(); var updated = AllTasks(info).FirstOrDefault(t => S(t, "id") == S(interaction, "id")); progressed = updated != null && N(updated, "progress") >= N(updated, "total_progress"); }
                        if (progressed) break;
                    }
                } finally { await Act("visit", "Leave", O(("host_gid", host), ("host_type", hostType))); }
                if (progressed) break;
            }
            Check("friend-interaction", progressed ? "passed" : "pending", progressed ? "Task progress verified after real help operation" : "No verified interaction yet");
        }
        info = await TaskInfo();
        var claimable = AllTasks(info).Where(t => B(t, "is_unlocked") && !B(t, "is_claimed") && N(t, "progress") >= N(t, "total_progress")).Select(t => N(t, "id")).ToList();
        if (claimable.Count > 0) await Act("task", "BatchClaimTaskReward", O(("ids", A(claimable))));
        info = await TaskInfo(); var final = DailyTasks(info); _report["tasksAfter"] = A(AllTasks(info).Select(TaskView));
        foreach (var task in final) {
            string label = N(task, "cond_type") switch { 16 => "task-login", 17 => "task-harvest", 18 => "task-friend", _ => "task-" + S(task, "id") };
            var detail = TaskView(task);
            if (N(task, "cond_type") == 17 && !B(task, "is_claimed")) {
                var supply = RespectWait(FertilizerBudget.Plan(_current, _now(), await Stock(), await Offers()));
                long mature = _current.Where(l => P(l, "plant") != null).Select(l => FarmCrop.Mature(l["plant"])).DefaultIfEmpty(0).Max();
                detail["nextEligibleAt"] = supply.BatchFertilizeAt > 0 ? supply.BatchFertilizeAt : mature;
                detail["waitingFor"] = "own-mature-crop-or-one-stealable-friend-crop";
            }
            Check(label, B(task, "is_claimed") ? "passed" : "pending", detail);
        }
        bool complete = !_dry && final.Count >= 3 && final.All(t => B(t, "is_claimed"));
        if (daily.Count >= 3) Check("daily-tasks", complete ? "passed" : "pending", A(final.Select(TaskView)));
        _report["daily"] = O(("observed", final.Count), ("claimed", final.Count(t => B(t, "is_claimed"))), ("complete", complete), ("tasks", A(final.Select(TaskView))));
    }
    private async Task VipDaily()
    {
        var gift = await Read("vip", "GetDailyGiftStatus");
        if (B(gift, "claimed_today")) { Check("vip-daily", "passed", "Server confirms claimed_today"); return; }
        if (!B(gift, "can_claim")) { Check("vip-daily", B(gift, "is_qq_vip") ? "pending" : "not-applicable", "Server reports reward unavailable"); return; }
        await Act("vip", "ClaimDailyGift", O(("config_id", 1))); gift = await Read("vip", "GetDailyGiftStatus");
        Check("vip-daily", !_dry && B(gift, "claimed_today") ? "passed" : "unverified", O(("claimedToday", B(gift, "claimed_today"))));
    }
    private async Task VipRewards()
    {
        var vip = await Read("vip", "GetQQVipRewardsStatus");
        if (B(vip, "claimed_today")) { Check("vip-rewards", "passed", "Server confirms claimed_today"); return; }
        if (!B(vip, "can_claim")) { Check("vip-rewards", B(vip, "is_qq_vip") ? "pending" : "not-applicable", "Server reports reward unavailable"); return; }
        var ids = L(vip, "active_configs").Where(c => B(c, "is_enable")).Select(c => N(c, "id")).ToList();
        if (ids.Count == 0) throw new IOException("VIP reward is claimable but has no enabled configuration");
        await Act("vip", "ClaimQQVipRewards", O(("config_ids", A(ids)))); vip = await Read("vip", "GetQQVipRewardsStatus");
        Check("vip-rewards", !_dry && B(vip, "claimed_today") ? "passed" : "unverified", O(("claimedToday", B(vip, "claimed_today"))));
    }
    private async Task FreeBenefits()
    {
        var products = new JsonArray(); bool found = false;
        // 会员资格决定 SVIP 商城免费品能否领取；无资格的商品不能用来卡住当日验收。
        var vip = await Read("vip", "GetQQVipRewardsStatus");
        bool vipActive = B(vip, "is_qq_vip"), mallFreeCanClaim = B(vip, "mall_free_can_claim");
        foreach (long slot in new long[] { 1, 4, 5 }) {
            var request = O(("slot_type", slot), ("global_scene_id", _scene), ("is_manual_open", true));
            var initial = L(await Read("mall", "GetMallListBySlotType", request), "products");
            foreach (var product in initial.Where(p => B(p, "is_free"))) {
                bool fertilizer = L(product, "items").Any(i => FertilizerBudget.Items.ContainsKey(N(i, "id")) || FertilizerBudget.Boxes.Contains(N(i, "id")) || N(i, "id") is 1011 or 1012) || S(product, "name").Contains("化肥");
                found |= fertilizer; bool purchased = false;
                bool adOnly = B(product, "ad_only");
                // 会员专属：账户非会员时该商品永久不可领，标记为不需要处理，而不是未核实。
                bool membershipOnly = S(product, "name").Contains("SVIP") || S(product, "name").Contains("会员") || S(product, "name").Contains("VIP");
                if (B(product, "is_available_purchase") && !adOnly) {
                    var r = await Act("mall", "Purchase", O(("id", N(product, "id")), ("buy_num", 1)));
                    if (!_dry && !B(r, "success")) throw new IOException("Free product " + N(product, "id") + " purchase returned success=false"); purchased = !_dry;
                }
                var updated = L(await Read("mall", "GetMallListBySlotType", request), "products").FirstOrDefault(p => S(p, "id") == S(product, "id"));
                var limit = P(updated, "restriction"); bool exhausted = N(limit, "max_count") > 0 && N(limit, "current_count") >= N(limit, "max_count");
                bool verified = exhausted || purchased && updated != null && !B(updated, "is_available_purchase");
                bool unavailable = updated == null || !B(updated, "is_available_purchase");
                // not-applicable：服务端明确说明本账号无权或无通道领取，本轮不再要求复核。
                string state = verified ? "verified"
                    : unavailable && membershipOnly && (!vipActive || !mallFreeCanClaim) ? "not-applicable"
                    : unavailable && adOnly ? "not-applicable"
                    : "unverified";
                products.Add(O(("id", N(product, "id")), ("name", S(product, "name")), ("fertilizer", fertilizer), ("available", B(product, "is_available_purchase")),
                    ("purchased", purchased), ("exhausted", exhausted), ("verified", verified), ("adOnly", adOnly), ("membershipOnly", membershipOnly),
                    ("limit", limit == null ? null : Copy(limit)), ("state", state), ("items", P(product, "items"))));
            }
        }
        _report["freeProducts"] = Copy(products);
        _report["vip"] = O(("isQqVip", vipActive), ("mallFreeCanClaim", mallFreeCanClaim));
        var required = products.Where(p => B(p, "fertilizer") && S(p, "state") != "not-applicable").ToList();
        string freeStatus = !found ? "pending" : required.Count == 0 ? "not-applicable" : required.All(p => S(p, "state") == "verified") && !_dry ? "passed" : "unverified";
        Check("free-fertilizer", freeStatus, O(("reason", "product-and-limit-recheck"), ("isQqVip", vipActive), ("mallFreeCanClaim", mallFreeCanClaim), ("products", products)));
        var daily = products.Where(p => (B(p, "fertilizer") || S(p, "name").Contains("每日")) && S(p, "state") != "not-applicable").ToList();
        Check("free-benefits", daily.Count == 0 ? "not-applicable" : !_dry && daily.All(p => S(p, "state") == "verified") ? "passed" : "pending", A(daily));
    }
    private async Task FinalState()
    {
        _current = await Lands(); var stock = await Stock(); long time = _now();
        _basic["gold"] = stock.Gold; _report["account"]["gold"] = stock.Gold;
        _emit(O(("type", "profile"), ("name", S(_basic, "name")), ("gid", N(_basic, "gid")), ("level", N(_basic, "level")),
            ("gold", stock.Gold), ("exp", N(_basic, "exp")), ("points", stock.Points), ("fertHours", stock.Bucket[1011] / 3600.0), ("fertOrgHours", stock.Bucket[1012] / 3600.0)));
        var supply = RespectWait(FertilizerBudget.Plan(_current, time, stock, await Offers())); _report["fertilizer"] = supply.Json();
        var planted = _current.Where(l => P(l, "plant") != null).ToList();
        var clocks = A(planted.Select(l => O(("id", N(l, "id")), ("crop", S(l["plant"], "name")), ("phase", FarmCrop.Phase(l["plant"], time)),
            ("matureAt", FarmCrop.Mature(l["plant"])), ("growAt", FarmCrop.Grow(l["plant"])))));
        var mature = planted.Select(l => FarmCrop.Mature(l["plant"])).ToList(); var grow = planted.Select(l => FarmCrop.Grow(l["plant"])).ToList();
        var dead = planted.Where(l => FarmCrop.Dead(l["plant"], time)).ToList();
        var ripe = planted.Where(l => FarmCrop.Ripe(l["plant"], time)).ToList();
        var clock = O(("minMatureAt", mature.Where(t => t > time).DefaultIfEmpty(0).Min()), ("lastGrowAt", grow.Where(t => t > time).DefaultIfEmpty(0).Min()),
            ("planted", planted.Count), ("lands", clocks), ("batchMatureAt", mature.DefaultIfEmpty(0).Max()), ("batchFertilizeAt", supply.BatchFertilizeAt),
            ("deadCount", dead.Count), ("ripeCount", ripe.Count), ("mode", "whole-farm"), ("fertilizerNeedSec", supply.NeedSec));
        _report["cropClock"] = clock;
        var evt = (JsonObject)clock.DeepClone(); evt["type"] = "maturity"; _emit(evt);
        _emit(O(("type", "fert-stock"), ("total", stock.Bucket[1011] / 3600.0), ("sec", stock.Bucket[1011])));
        var detail = O(("total", _current.Count), ("planted", planted.Count), ("dead", dead.Count), ("ripe", ripe.Count),
            ("matureRemaining", mature.Count(t => t <= time)));
        // Partly regrowing/finished crops must wait for the whole batch.
        bool waitingForBatch = planted.Any(l => !FarmCrop.Dead(l["plant"], time) && FarmCrop.Mature(l["plant"]) > time) &&
            (dead.Count > 0 || ripe.Count > 0 || planted.Count < _current.Count);
        string status = waitingForBatch ? "not-due" : _current.Count == 0 || planted.Count != _current.Count ? "pending"
            : dead.Count > 0 ? (_dry ? "pending" : "failed")
            : ripe.Count > 0 ? (_dry ? "pending" : "failed")
            : mature.All(t => t <= 0) ? "pending" : "passed";
        Check("final-state", status, detail);
    }
}
