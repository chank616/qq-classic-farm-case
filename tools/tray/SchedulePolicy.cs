using System;
using System.Text.Json;

namespace FarmTray
{
    internal static class SchedulePolicy
    {
        internal static bool RestoreRetry(JsonElement report, out DateTimeOffset? lastAttempt)
        {
            lastAttempt = null;
            foreach (var key in new[] { "finishedAt", "generatedAt", "startedAt" })
                if (report.TryGetProperty(key, out var at) && DateTimeOffset.TryParse(at.GetString(), out var time)) { lastAttempt = time; break; }
            return report.TryGetProperty("status", out var status) && status.GetString() is "failed" or "waiting-bridge" ||
                report.TryGetProperty("checks", out var checks) && checks.ValueKind == JsonValueKind.Array &&
                checks.EnumerateArray().Any(c => c.TryGetProperty("status", out var value) && value.GetString() == "failed");
        }
        internal static DateTimeOffset Next(DateTimeOffset now, DateTimeOffset? lastPass,
            DateTimeOffset? lastAttempt, long maturity, long finalGrowth, bool hasFertilizer,
            bool retryNeeded = false, int minimumMinutes = 5, int bufferSeconds = 90, string checkedDay = null)
        {
            var china = TimeZoneInfo.FindSystemTimeZoneById("China Standard Time");
            var local = TimeZoneInfo.ConvertTime(now, china);
            var next = new DateTimeOffset(local.Date.AddDays(1), TimeSpan.FromHours(8));
            if (!lastPass.HasValue || TimeZoneInfo.ConvertTime(lastPass.Value, china).Date < local.Date) next = now;
            if (!string.IsNullOrEmpty(checkedDay) && checkedDay != local.ToString("yyyy-MM-dd")) next = now;
            long wake = hasFertilizer && finalGrowth > 0 ? finalGrowth : maturity;
            if (wake > 0) {
                var crop = DateTimeOffset.FromUnixTimeSeconds(wake).AddSeconds(bufferSeconds);
                if (crop < next) next = crop;
            }
            if (retryNeeded) {
                var retry = (lastAttempt ?? lastPass ?? now).AddMinutes(minimumMinutes);
                if (retry < next) next = retry;
            }
            var floor = lastAttempt?.AddMinutes(minimumMinutes);
            return floor.HasValue && next < floor.Value ? floor.Value : next;
        }

        internal static void SelfTest()
        {
            var now = DateTimeOffset.Parse("2026-10-17T12:00:00Z");
            var recent = now.AddMinutes(-10);
            long tomorrowCrop = now.AddDays(1).ToUnixTimeSeconds();
            var midnight = DateTimeOffset.Parse("2026-10-17T16:00:00Z");
            if (Next(now, recent, recent, tomorrowCrop, 0, false) != midnight)
                throw new Exception("An unnecessary periodic pass was scheduled before the next event");
            var growth = now.AddHours(2);
            if (Next(now, recent, recent, tomorrowCrop, growth.ToUnixTimeSeconds(), true) != growth.AddSeconds(90))
                throw new Exception("Whole-batch fertilizer event was not scheduled");
            var mature = now.AddHours(3);
            if (Next(now, recent, recent, mature.ToUnixTimeSeconds(), growth.ToUnixTimeSeconds(), false) != mature.AddSeconds(90))
                throw new Exception("Insufficient supply did not wait for natural maturity");
            if (Next(now, recent, recent, 0, 0, false) != midnight)
                throw new Exception("Missing crop clock triggered an unnecessary periodic pass");
            if (Next(now, null, null, 0, 0, false) != now)
                throw new Exception("Initial QQ session did not trigger a pass");
            var afterMidnight = midnight.AddMinutes(1);
            if (Next(afterMidnight, recent, recent, tomorrowCrop, 0, false) != afterMidnight)
                throw new Exception("Daily refresh did not trigger a pass");
            if (Next(afterMidnight, afterMidnight, null, tomorrowCrop, 0, false, checkedDay: "2026-10-17") != afterMidnight)
                throw new Exception("A pass crossing midnight concealed unprocessed daily refresh");
            if (Next(now, recent, now.AddMinutes(-1), tomorrowCrop, 0, false, true) != now.AddMinutes(4))
                throw new Exception("Failure retry throttle is incorrect");
            var clock = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var snapshot = new Snapshot { FertHaveSec = 100000 };
            for (int i = 0; i < 24; i++) snapshot.Lands.Add(new LandRow {
                Id = i + 1, MatureAt = clock + 7200 + i * 60, GrowAt = clock + 3600 + i * 60 });
            DashboardData.ApplyBatchClock(snapshot);
            if (snapshot.NextMatureAt != clock + 7200 + 23 * 60 || snapshot.NextFertileAt != clock + 3600 + 23 * 60)
                throw new Exception("Whole-farm clock did not wait for the last land");
            snapshot.FertHaveSec = 1;
            DashboardData.ApplyBatchClock(snapshot);
            if (snapshot.NextFertileAt != 0) throw new Exception("Insufficient fertilizer scheduled a partial batch");
            snapshot.HasFertilizerPlan = true; snapshot.PlannedFertileAt = clock + 3600 + 23 * 60;
            DashboardData.ApplyBatchClock(snapshot);
            if (snapshot.NextFertileAt != snapshot.PlannedFertileAt)
                throw new Exception("The verified bag-and-points plan was overwritten by a container-only estimate");
            using var failed = JsonDocument.Parse("{\"status\":\"failed\",\"generatedAt\":\"2026-10-17T11:59:00Z\"}");
            if (!RestoreRetry(failed.RootElement, out var restartAttempt) || Next(now, recent, restartAttempt, 0, 0, false, true) != now.AddMinutes(4))
                throw new Exception("Restart lost an outstanding failure retry");
            using var partial = JsonDocument.Parse("{\"status\":\"incomplete\",\"checks\":[{\"status\":\"failed\"}]}");
            if (!RestoreRetry(partial.RootElement, out _)) throw new Exception("Incomplete pass concealed a failed stage after restart");
            using var verified = JsonDocument.Parse("{\"status\":\"verified\",\"checks\":[{\"status\":\"passed\"}]}");
            if (RestoreRetry(verified.RootElement, out _)) throw new Exception("Verified pass scheduled a needless retry after restart");
            using var waiting = JsonDocument.Parse("{\"status\":\"waiting-bridge\",\"generatedAt\":\"2026-10-17T11:59:00Z\"}");
            if (!RestoreRetry(waiting.RootElement, out var waitingAttempt) || Next(now, recent, waitingAttempt, 0, 0, false, true) != now.AddMinutes(4))
                throw new Exception("Upgrade retained the obsolete waiting-bridge pause");
            Console.WriteLine("15 scheduler checks passed");
        }
    }
}
