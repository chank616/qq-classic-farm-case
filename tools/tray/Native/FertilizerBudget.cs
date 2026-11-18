using System.Text.Json.Nodes;
using static FarmTray.Native.JsonData;

namespace FarmTray.Native;

internal static class FarmCrop
{
    // gamepb.plantpb.PlantPhase: 6 = 成熟(可收获), 7 = 枯死. The server sends the planned
    // phase list with begin_time, and once a crop dies it keeps a single phase-7 entry
    // without begin_time, so the harvest deadline can never be read from the last entry.
    internal const long PhaseDead = 7, PhaseMature = 6;
    private static int MatureIndex(JsonNode plant)
    {
        var phases = L(plant, "phases");
        for (int i = phases.Count - 1; i >= 0; i--) if (N(phases[i], "phase") == PhaseMature) return i;
        return phases.Count - 1;
    }
    // Current phase = the latest entry whose begin_time has arrived (reference:
    // it00021hot/qq-farm-core logic.GetCurrentPhase).
    internal static long Phase(JsonNode plant, long time)
    {
        var phases = L(plant, "phases");
        for (int i = phases.Count - 1; i >= 0; i--) { long begin = N(phases[i], "begin_time"); if (begin > 0 && begin <= time) return N(phases[i], "phase"); }
        return phases.Count > 0 ? N(phases[0], "phase") : 0;
    }
    internal static bool Dead(JsonNode plant, long time) => Phase(plant, time) == PhaseDead;
    internal static long Mature(JsonNode plant) => N(L(plant, "phases").ElementAtOrDefault(MatureIndex(plant)), "begin_time");
    internal static long Grow(JsonNode plant) { var p = L(plant, "phases"); int i = MatureIndex(plant); return i >= 1 ? N(p[i - 1], "begin_time") : 0; }
    internal static bool Ripe(JsonNode plant, long time)
    {
        long phase = Phase(plant, time);
        if (phase == PhaseDead) return false;
        if (phase == PhaseMature) return true;
        if (phase > 0) return false;
        long mature = Mature(plant); return mature > 0 && mature <= time;
    }
    internal static bool Ready(IEnumerable<JsonNode> plots, long time)
    {
        var occupied = plots.Where(l => P(l, "plant") != null).ToList();
        return occupied.Count > 0 && occupied.All(l => Ripe(l["plant"], time));
    }
}

internal sealed class FertilizerStock
{
    internal Dictionary<long, long> Bucket = new() { [1011] = 0, [1012] = 0 }, Packed = new() { [1011] = 0, [1012] = 0 };
    internal long Points, Gold;
    internal List<JsonNode> Physical = new();
    internal List<JsonNode> Boxes => Physical.Where(i => FertilizerBudget.Boxes.Contains(N(i, "id"))).ToList();
    internal static FertilizerStock FromBag(JsonNode bag, long time)
    {
        var s = new FertilizerStock(); var virtualItems = L(bag, "virtual_items").GroupBy(i => N(i, "id")).ToDictionary(g => g.Key, g => g.Sum(i => N(i, "count")));
        s.Bucket[1011] = virtualItems.GetValueOrDefault(1011); s.Bucket[1012] = virtualItems.GetValueOrDefault(1012); s.Points = virtualItems.GetValueOrDefault(1002);
        s.Gold = virtualItems.GetValueOrDefault(1001);
        s.Physical = L(bag, "physical_items").Where(i => N(i, "count") > 0 && !B(i, "is_locked") && !(N(i, "expire_time") > 0 && N(i, "expire_time") <= time)).ToList();
        foreach (var i in s.Physical) if (FertilizerBudget.Items.TryGetValue(N(i, "id"), out var p)) s.Packed[p.Type] += p.Seconds * N(i, "count");
        return s;
    }
    internal FertilizerStock ContainersOnly() => new() { Bucket = new(Bucket), Points = Points, Physical = Physical };
}

internal sealed record FertilizerOffer(long Id, long Price, long NormalSec, long OrganicSec, long Remaining, long Slot)
{
    internal JsonObject Json(long? count = null)
    {
        var j = O(("id", Id), ("price", Price), ("normalSec", NormalSec), ("organicSec", OrganicSec), ("remaining", Remaining == long.MaxValue ? null : (object)Remaining), ("slot", Slot));
        if (count.HasValue) j["count"] = count.Value; return j;
    }
}
internal sealed record FertilizerGroup(long Id, List<long> Lands, long NeedSec);
internal sealed record FertilizerPurchase(FertilizerOffer Offer, long Count);
internal sealed class FertilizerPlan
{
    internal long NeedSec, PhaseAt, PointsCost, NormalBucketSec, OrganicBucketSec, NormalBagSec, OrganicBagSec, Points, UnresolvedBoxes;
    internal bool Sufficient, Ready, WaitNatural;
    internal List<FertilizerPurchase> Purchases = new();
    internal List<FertilizerGroup> Groups = new();
    internal List<FertilizerOffer> Offers = new();
    internal long BatchFertilizeAt => Sufficient ? PhaseAt : 0;
    internal long OwnedTotalSec => NormalBucketSec + OrganicBucketSec + NormalBagSec + OrganicBagSec;
    internal JsonObject Json() => O(("needSec", NeedSec), ("phaseAt", PhaseAt), ("ready", Ready), ("sufficient", Sufficient),
        ("batchFertilizeAt", BatchFertilizeAt), ("pointsCost", PointsCost), ("purchases", A(Purchases.Select(p => p.Offer.Json(p.Count)))),
        ("groups", A(Groups.Select(g => O(("fertilizerId", g.Id), ("landIds", A(g.Lands)), ("needSec", g.NeedSec))))),
        ("normalBucketSec", NormalBucketSec), ("organicBucketSec", OrganicBucketSec), ("normalBagSec", NormalBagSec), ("organicBagSec", OrganicBagSec),
        ("points", Points), ("ownedTotalSec", OwnedTotalSec), ("unresolvedBoxes", UnresolvedBoxes), ("waitNatural", WaitNatural), ("offers", A(Offers.Select(o => o.Json()))));
}

internal static class FertilizerBudget
{
    internal static readonly Dictionary<long, (long Type, long Seconds)> Items = new() {
        [80001] = (1011, 3600), [80002] = (1011, 14400), [80003] = (1011, 28800), [80004] = (1011, 43200),
        [80011] = (1012, 3600), [80012] = (1012, 14400), [80013] = (1012, 28800), [80014] = (1012, 43200)
    };
    internal static readonly HashSet<long> Boxes = new() { 100003, 100004 };
    internal static List<FertilizerOffer> Offers(IEnumerable<JsonNode> products, long time)
    {
        var result = new List<FertilizerOffer>();
        foreach (var p in products.GroupBy(p => N(p, "id")).Select(g => g.Last())) {
            if (N(p["price"], "id") != 1002 || N(p["price"], "count") <= 0 || B(p, "ad_only") || P(p, "share") != null || B(p, "is_owned") || N(p, "end_time") > 0 && N(p, "end_time") <= time) continue;
            long max = N(p["restriction"], "max_count"), remaining = max > 0 ? Math.Max(0, max - N(p["restriction"], "current_count")) : long.MaxValue;
            if (remaining == 0 || max > 0 && !B(p, "is_available_purchase")) continue;
            long normal = 0, organic = 0;
            foreach (var i in L(p, "items")) {
                long id = N(i, "id"), count = N(i, "count");
                if (Items.TryGetValue(id, out var item)) { if (item.Type == 1011) normal += item.Seconds * count; else organic += item.Seconds * count; }
                else if (id == 1011) normal += count; else if (id == 1012) organic += count;
            }
            if (normal == 0 && organic == 0) continue;
            bool discount = N(p, "discount_price") > 0 && N(p, "discount_start_time") <= time && N(p, "discount_end_time") > time;
            result.Add(new(N(p, "id"), discount ? N(p, "discount_price") : N(p["price"], "count"), normal, organic, remaining, N(p, "slot_type")));
        }
        return result;
    }
    internal sealed record Allocation(int Mask, long Normal, long Organic);
    internal static Allocation Allocate(long[] costs, long normal, long organic, bool[] allowed = null)
    {
        long total = costs.Sum(); if (normal + organic < total) return null;
        var eligible = Enumerable.Range(0, costs.Length).Where(i => allowed == null || allowed[i]).ToArray(); int mid = eligible.Length / 2;
        List<(long Sum, int Mask)> Subsets(IEnumerable<int> indices) {
            var list = new List<(long Sum, int Mask)> { (0, 0) };
            foreach (int index in indices) for (int n = list.Count, i = 0; i < n; i++) {
                long sum = list[i].Sum + costs[index]; if (sum <= normal) list.Add((sum, list[i].Mask | (1 << index)));
            }
            return list;
        }
        var left = Subsets(eligible.Take(mid)); var right = Subsets(eligible.Skip(mid)); right.Sort((a, b) => a.Sum.CompareTo(b.Sum));
        Allocation best = null;
        foreach (var l in left) {
            int lo = 0, hi = right.Count - 1, found = -1;
            while (lo <= hi) { int m = (lo + hi) / 2; if (right[m].Sum <= normal - l.Sum) { found = m; lo = m + 1; } else hi = m - 1; }
            if (found < 0) continue; long sum = l.Sum + right[found].Sum;
            if (total - sum <= organic && (best == null || sum > best.Normal)) best = new(l.Mask | right[found].Mask, sum, total - sum);
        }
        return best;
    }
    private sealed record PurchaseState(long Normal, long Organic, long Cost, long[] Counts);
    internal static FertilizerPlan Plan(List<JsonNode> plots, long time, FertilizerStock stock, List<FertilizerOffer> offers = null)
    {
        offers ??= new(); var active = plots.Where(l => P(l, "plant") != null && !FarmCrop.Dead(l["plant"], time)).ToList();
        var unripe = active.Where(l => FarmCrop.Mature(l["plant"]) > time).ToList();
        bool valid = active.All(l => FarmCrop.Mature(l["plant"]) > 0) && unripe.All(l => FarmCrop.Grow(l["plant"]) > 0);
        long phase = unripe.Count > 0 && valid ? unripe.Max(l => FarmCrop.Grow(l["plant"])) : 0;
        var costs = unripe.Select(l => Math.Max(0, FarmCrop.Mature(l["plant"]) - Math.Max(time, phase))).ToArray();
        var allowed = unripe.Select(l => P(l["plant"], "left_inorc_fert_times") == null || N(l["plant"], "left_inorc_fert_times") != 0).ToArray();
        long need = costs.Sum(), normal = stock.Bucket[1011] + stock.Packed[1011], organic = stock.Bucket[1012] + stock.Packed[1012];
        var result = new FertilizerPlan { NeedSec = need, PhaseAt = phase, NormalBucketSec = stock.Bucket[1011], OrganicBucketSec = stock.Bucket[1012],
            NormalBagSec = stock.Packed[1011], OrganicBagSec = stock.Packed[1012], Points = stock.Points, UnresolvedBoxes = stock.Boxes.Count, Offers = offers };
        Allocation allocation = null;
        if (valid && unripe.Count > 0) allocation = Allocate(costs, stock.Bucket[1011], stock.Bucket[1012], allowed) ?? Allocate(costs, normal, organic, allowed);
        if (allocation == null && valid && unripe.Count > 0 && offers.Count > 0) {
            var frontier = new PriorityQueue<PurchaseState, long>(); frontier.Enqueue(new(0, 0, 0, new long[offers.Count]), 0);
            var seen = new Dictionary<string, long>();
            while (frontier.TryDequeue(out var state, out _)) {
                string key = state.Normal + ":" + state.Organic + ":" + string.Join(',', state.Counts.Select((n, i) => offers[i].Remaining == long.MaxValue ? "" : n.ToString()));
                if (seen.TryGetValue(key, out long prior) && prior <= state.Cost) continue; seen[key] = state.Cost;
                allocation = Allocate(costs, normal + state.Normal, organic + state.Organic, allowed);
                if (allocation != null) {
                    result.PointsCost = state.Cost;
                    result.Purchases = state.Counts.Select((n, i) => new FertilizerPurchase(offers[i], n)).Where(p => p.Count > 0).ToList(); break;
                }
                for (int i = 0; i < offers.Count; i++) {
                    var offer = offers[i]; long cost = state.Cost + offer.Price;
                    if (cost > stock.Points || state.Counts[i] >= offer.Remaining) continue;
                    long n = Math.Min(need, state.Normal + offer.NormalSec), o = Math.Min(need, state.Organic + offer.OrganicSec);
                    if (n == state.Normal && o == state.Organic) continue;
                    var counts = (long[])state.Counts.Clone(); counts[i]++; frontier.Enqueue(new(n, o, cost, counts), cost);
                }
            }
        }
        result.Sufficient = allocation != null; result.Ready = allocation != null && phase <= time;
        if (allocation != null) foreach (long type in new long[] { 1011, 1012 }) {
            var ids = unripe.Where((_, i) => ((allocation.Mask & (1 << i)) != 0) == (type == 1011)).Select(l => N(l, "id")).ToList();
            if (ids.Count > 0) result.Groups.Add(new(type, ids, type == 1011 ? allocation.Normal : allocation.Organic));
        }
        return result;
    }
}
