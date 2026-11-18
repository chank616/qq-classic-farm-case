using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows.Forms;
using FarmTray.Native;

namespace FarmTray
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            if (Environment.GetCommandLineArgs().Contains("--self-test")) { SchedulePolicy.SelfTest(); return; }
            if (Environment.GetCommandLineArgs().Contains("--install-autostart")) { TrayContext.SetAutostart(true); return; }
            if (Environment.GetCommandLineArgs().Contains("--remove-autostart")) { TrayContext.SetAutostart(false); return; }
            if (Environment.GetCommandLineArgs().Contains("--native-self-test"))
            {
                try { NativeSelfChecks.Run().GetAwaiter().GetResult(); }
                catch (Exception error) { Console.Error.WriteLine(error); Environment.ExitCode = 1; }
                return;
            }
            if (Environment.GetCommandLineArgs().Any(a => a is "--run-native" or "--inspect-native"))
            {
                try {
                    Environment.ExitCode = NativeFarmRunner.Run(Environment.GetCommandLineArgs().Contains("--inspect-native")).GetAwaiter().GetResult();
                } catch (Exception error) { Console.Error.WriteLine(error.Message); Environment.ExitCode = 1; }
                return;
            }
            if (Environment.GetCommandLineArgs().Contains("--render-preview"))
            {
                Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                DashboardPreview.Render();
                return;
            }
            using var singleInstance = new System.Threading.Mutex(true, "Local\\QQFarmTray", out var created);
            if (!created) return;
            Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try {
                using var ctx = new TrayContext(); Application.Run(ctx);
            } catch (Exception error) { MessageBox.Show(error.Message, "QQ 农场", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        }
    }

    // ── 配置 ────────────────────────────────────────────────
    internal sealed class Config
    {
        public bool AutoStartQq { get; set; } = false;
        public int MinIntervalMinutes { get; set; } = 5;
        public int BufferSeconds { get; set; } = 90;
        public int PassTimeoutMinutes { get; set; } = 15;

        public static Config Load(string path)
        {
            try
            {
                if (File.Exists(path))
                    return JsonSerializer.Deserialize<Config>(File.ReadAllText(path)) ?? new Config();
            }
            catch { }
            return new Config();
        }

        public void Save(string path)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                File.WriteAllText(path, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
            }
            catch { }
        }
    }

    internal sealed class LandRow
    {
        public int Id;
        public string Crop = "";
        public long MatureAt;
        public long GrowAt;
        public long Phase;
    }

    // ── 状态快照 ────────────────────────────────────────────
    internal sealed class Snapshot
    {
        public DateTime At = DateTime.Now;
        public bool QqRunning;
        public int QqCount;
        public bool FarmWindow;
        public bool SinkUp;
        public string ProfileName = "";
        public long Gid;
        public int Level;
        public long Gold;
        public long Exp;
        public int BigLevel;
        public long BigExp;
        public DateTime? LastEvent;
        public string LastType = "";
        public DateTime? LastPageCode;
        public string CodeFp = "";
        public int CodeLen;
        public DateTime? LastPass;
        public DateTime? LastSuccess;
        public long NextMatureAt;
        public long NextFertileAt;
        public long Points;
        public long Diamonds;
        public double FertHours;
        public double FertOrgHours;
        public double FertBagHours, FertOrgBagHours;
        public bool HasFertilizerPlan, FertilizerSufficient;
        public long PlannedFertileAt, PlannedPoints, PlannedNeedSec, PlannedPointBalance;
        public double PlannedNormalHours, PlannedOrganicHours;
        public long FertNeedSec;
        public long FertHaveSec;
        public int Planted;
        public int DeadLands;
        public bool PassRunning;
        public bool WaitingForBridge, StaleData;
        public DateTime? DataAt;
        public string LastError = "";
        public DateTime? LastErrorAt;
        public string Verification = "尚未验收";
        public bool TodayVerified, VipVerified, FreeFertVerified, VipSkipped, FreeFertSkipped;
        public string DailyCheckedDay = "";
        public int DailyClaimed, DailyTotal;
        public List<DailyTaskRow> DailyTasks = new List<DailyTaskRow>();
        public int DiagEvents, DiagLands, DiagErrors;
        public List<LandRow> Lands = new List<LandRow>();
    }

    // ── 托盘主逻辑 ──────────────────────────────────────────
    internal sealed class TrayContext : ApplicationContext
    {
        private readonly NotifyIcon _icon;
        private readonly System.Windows.Forms.Timer _poll = new System.Windows.Forms.Timer { Interval = 2000 };

        private readonly string _root;
        private readonly string _capture;
        private readonly string _stamp;
        private readonly string _configPath;
        private Config _cfg;

        private Snapshot _snap = new Snapshot();
        private DetailForm _detail;
        private DateTime _passStarted = DateTime.MinValue;
        private DateTime _lastAttempt = DateTime.MinValue;
        private DateTime? _lastFinished;
        private System.Threading.CancellationTokenSource _passCancellation;
        private bool _retryNeeded;
        private string _statusSignature = "";
        private readonly StringBuilder _log = new StringBuilder();
        private int _diagEvents, _diagLands, _diagErrors;

        public TrayContext()
        {
            _root = FindRoot();
            _capture = Path.Combine(_root, "artifacts", "m0-code-capture.jsonl");
            _stamp = Path.Combine(_root, "artifacts", "farm-schedule.json");
            _configPath = Path.Combine(_root, "artifacts", "tray-config.json");
            _cfg = Config.Load(_configPath);
            _cfg.Save(_configPath);
            try {
                using var previous = JsonDocument.Parse(File.ReadAllText(Path.Combine(_root, "artifacts", "farm-status.json")));
                _retryNeeded = SchedulePolicy.RestoreRetry(previous.RootElement, out var attempt);
                if (_retryNeeded && attempt.HasValue) _lastAttempt = attempt.Value.LocalDateTime;
            } catch { }

            _icon = new NotifyIcon
            {
                Icon = LoadIcon(),
                Text = "QQ经典农场",
                Visible = true,
                ContextMenuStrip = BuildMenu(),
            };
            _icon.MouseDoubleClick += (s, e) => { if (e.Button == MouseButtons.Left) ShowDetail(); };

            _poll.Tick += (s, e) => Tick();
            _poll.Start();
            Tick();
            if (Environment.GetCommandLineArgs().Contains("--run-now")) RunPass(true);

            if (Environment.GetCommandLineArgs().Any(a => string.Equals(a, "--show", StringComparison.OrdinalIgnoreCase)))
                ShowDetail();
        }

        private static Icon LoadIcon()
        {
            try
            {
                var asm = typeof(TrayContext).Assembly;
                using (var s = asm.GetManifestResourceStream("farm.ico"))
                {
                    if (s != null) return new Icon(s);
                }
            }
            catch { }
            return SystemIcons.Application;
        }

        private static string FindRoot()
        {
            return FarmPaths.Root;
        }

        private ContextMenuStrip BuildMenu()
        {
            var m = new ContextMenuStrip { Font = SystemFonts.MessageBoxFont };
            m.Items.Add("打开面板", null, (s, e) => ShowDetail());
            m.Items.Add(new ToolStripSeparator());
            m.Items.Add("立即巡检", null, (s, e) => RunPass(true));
            m.Items.Add("打开日志目录", null, (s, e) => OpenLogs());
            m.Items.Add(new ToolStripSeparator());

            var autoBoot = new ToolStripMenuItem("随系统启动") { CheckOnClick = true, Checked = IsAutostartEnabled() };
            autoBoot.CheckedChanged += (s, e) => SetAutostart(autoBoot.Checked);
            m.Items.Add(autoBoot);

            m.Items.Add(new ToolStripSeparator());
            m.Items.Add("退出", null, (s, e) => ExitApp());
            return m;
        }

        // ── 轮询 / 调度 ─────────────────────────────────────
        private void Tick()
        {
            UpdateSnapshot();

            if (_snap.PassRunning)
            {
                if ((DateTime.Now - _passStarted).TotalMinutes > _cfg.PassTimeoutMinutes)
                {
                    _passCancellation?.Cancel();
                }
            }
            else
            {
                var due = DueAt();
                if (due.HasValue && DateTime.Now >= due.Value)
                {
                    if (_snap.QqRunning) RunPass(false);
                }
            }

            UpdateUi();
            WriteRuntimeStatus();
        }

        private void WriteRuntimeStatus()
        {
            try
            {
                var status = new {
                    pid = Environment.ProcessId, qqRunning = _snap.QqRunning, sinkUp = _snap.SinkUp,
                    passRunning = _snap.PassRunning, nextDue = DueAt(), lastPass = _snap.LastPass,
                    verification = _snap.Verification, retryNeeded = _retryNeeded,
                    autoStartQq = false, mode = "whole-farm", batchSize = 24,
                    batchMatureAt = _snap.NextMatureAt, batchFertilizeAt = _snap.NextFertileAt, deadLands = _snap.DeadLands,
                    tooltip = _icon.Text, runtime = "csharp"
                    , waitingForBridge = _snap.WaitingForBridge, staleData = _snap.StaleData, dataAt = _snap.DataAt
                };
                var json = JsonSerializer.Serialize(status, new JsonSerializerOptions { WriteIndented = true });
                if (json == _statusSignature) return;
                var file = Path.Combine(_root, "artifacts", "tray-status.json");
                Directory.CreateDirectory(Path.GetDirectoryName(file));
                File.WriteAllText(file + ".tmp", json);
                File.Move(file + ".tmp", file, true);
                _statusSignature = json;
            }
            catch { }
        }

        private DateTime? DueAt()
        {
            var last = _lastFinished ?? _snap.LastPass;
            return SchedulePolicy.Next(DateTimeOffset.Now,
                last.HasValue ? new DateTimeOffset(last.Value) : null,
                _lastAttempt == DateTime.MinValue ? null : new DateTimeOffset(_lastAttempt),
                _snap.NextMatureAt, _snap.NextFertileAt, _snap.NextFertileAt > 0,
                _retryNeeded,
                _cfg.MinIntervalMinutes, _cfg.BufferSeconds, _snap.DailyCheckedDay).LocalDateTime;
        }

        private async void RunPass(bool manual)
        {
            if (_snap.PassRunning) return;
            if (!manual && !_snap.QqRunning) return;

            _snap.PassRunning = true;
            _passStarted = DateTime.Now;
            _lastAttempt = _passStarted;
            Append(manual ? "手动检查开始" : "到达检查时间，自动检查开始");
            try
            {
                _passCancellation = new System.Threading.CancellationTokenSource(TimeSpan.FromMinutes(_cfg.PassTimeoutMinutes));
                var menuHandle = _icon.ContextMenuStrip.Handle;
                int result = await System.Threading.Tasks.Task.Run(() => NativeFarmRunner.Run(false, _passCancellation.Token));
                _retryNeeded = result is 1 or 3;
                Append(result == 0 ? "C# 本轮逐项复核通过" : result == 4 ? "仅 QQ 后台接入未完成；不会自动启动农场" : "本轮有待完成项目，请查看验收报告");
            }
            catch (Exception ex)
            {
                _snap.PassRunning = false;
                _retryNeeded = true;
                Append("启动失败: " + ex.Message);
            }
            finally {
                _snap.PassRunning = false; _lastFinished = DateTime.Now;
                _passCancellation?.Dispose(); _passCancellation = null;
            }
        }

        // ── 快照 ────────────────────────────────────────────
        private void UpdateSnapshot()
        {
            var s = new Snapshot { At = DateTime.Now };
            string currentError = null;
            var qq = Process.GetProcessesByName("QQ");
            s.QqCount = qq.Length;
            s.QqRunning = qq.Length > 0;
            s.FarmWindow = qq.Any(p => { try { return p.MainWindowTitle != null && p.MainWindowTitle.Contains("农场"); } catch { return false; } });

            try
            {
                if (File.Exists(_stamp))
                {
                    using (var doc = JsonDocument.Parse(File.ReadAllText(_stamp)))
                    {
                        JsonElement el;
                        if (doc.RootElement.TryGetProperty("lastSuccess", out el))
                            s.LastSuccess = DateTime.TryParse(el.GetString(), out var dt) ? dt.ToLocalTime() : (DateTime?)null;
                        if (doc.RootElement.TryGetProperty("lastPass", out el) && DateTime.TryParse(el.GetString(), out var passTime))
                            s.LastPass = passTime.ToLocalTime();
                    }
                }
            }
            catch { }

            try
            {
                var cachedPath = Path.Combine(_root, "artifacts", "farm-last-state.json");
                if (File.Exists(cachedPath)) {
                    using var cached = JsonDocument.Parse(File.ReadAllText(cachedPath));
                    DashboardData.ApplyReport(s, cached.RootElement);
                    s.DataAt = s.LastPass;
                }
                var statusPath = Path.Combine(_root, "artifacts", "farm-status.json");
                if (File.Exists(statusPath))
                {
                    using var statusDoc = JsonDocument.Parse(File.ReadAllText(statusPath));
                    var report = statusDoc.RootElement;
                    DashboardData.ApplyReport(s, report);
                    s.WaitingForBridge = report.TryGetProperty("status", out var runStatus) && runStatus.GetString() == "waiting-bridge";
                    s.StaleData = !report.TryGetProperty("cropClock", out var currentCrop) || currentCrop.ValueKind != JsonValueKind.Object;
                    if (!s.StaleData) s.DataAt = s.LastPass;
                    if (report.TryGetProperty("error", out var reportError)) currentError = reportError.GetString() ?? "";
                    bool verified = report.TryGetProperty("allRequiredComplete", out var complete) && complete.GetBoolean();
                    var china = TimeZoneInfo.FindSystemTimeZoneById("China Standard Time");
                    verified = verified && report.TryGetProperty("day", out var day) &&
                        day.GetString() == TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, china).ToString("yyyy-MM-dd");
                    s.Verification = verified ? "逐项复核通过" : "仍有未完成或未核实项目";
                    if (!verified && report.TryGetProperty("checks", out var checks))
                    {
                        var pending = checks.EnumerateArray().Where(c =>
                            c.TryGetProperty("status", out var st) &&
                            !new[] { "passed", "not-due", "not-applicable" }.Contains(st.GetString()))
                            .Select(c => CheckLabel(c.GetProperty("id").GetString()));
                        s.Verification += "：" + string.Join("、", pending);
                    }
                }
            }
            catch { }

            foreach (var e in ReadTailEvents(768 * 1024))
            {
                var t = e.Type;
                if (!string.IsNullOrEmpty(t))
                {
                    s.LastType = t;
                    s.LastEvent = e.Time ?? s.LastEvent;
                }
                if (t == "page-code") { s.LastPageCode = e.Time ?? s.LastPageCode; s.CodeLen = e.CodeLen; s.CodeFp = e.CodeFp; }
                else if (t == "pass-finished")
                {
                    s.LastPass = e.Time ?? s.LastPass;
                    // 后续一轮只要没有失败就清掉更早的错误，旧的超时提示不再永久挂在面板上。
                    if (e.Status is "verified" or "incomplete" or "inspection-only" &&
                        (s.LastErrorAt == null || (e.Time.HasValue && e.Time.Value >= s.LastErrorAt.Value))) { s.LastError = ""; s.LastErrorAt = null; }
                }
                else if (t == "profile")
                {
                    s.ProfileName = e.Name; s.Gid = e.Gid; s.Level = e.Level; s.Gold = e.Gold;
                    s.Exp = e.Exp; s.BigLevel = e.BigLevel; s.BigExp = e.BigExp;
                    s.Points = e.Points; s.Diamonds = e.Diamonds;
                    s.FertHours = e.FertHours; s.FertOrgHours = e.FertOrgHours;
                    s.FertHaveSec = (long)Math.Round(e.FertHours * 3600);
                }
                else if (t == "maturity" && e.Time.HasValue)
                {
                    s.NextMatureAt = e.MinMatureAt; s.NextFertileAt = e.LastGrowAt; s.Planted = e.Planted; s.DeadLands = e.DeadCount;
                }
                else if (t == "fert-stock")
                {
                    s.FertHaveSec = e.Sec;
                    s.FertHours = e.Sec / 3600.0;
                }
                else if (t == "fert-budget")
                {
                    s.FertNeedSec = e.NeedSec; s.FertHaveSec = e.HaveSec;
                    s.FertHours = Math.Round(e.HaveSec / 3600.0, 1);
                }
                else if (t == "lands-all" && e.Lands != null) s.Lands = e.Lands;
                if (t == "pass-failed")
                {
                    s.LastError = (e.Error ?? "") + " @ " + (e.Time?.ToString("HH:mm:ss") ?? "");
                    s.LastErrorAt = e.Time ?? DateTime.Now;
                }
            }

            DashboardData.ApplyBatchClock(s);
            bool running = s.PassRunning = _snap.PassRunning;
            if (running) { s.LastError = _snap.LastError; s.LastErrorAt = _snap.LastErrorAt; }
            s.LastError = s.LastError == "" ? _snap.LastError : s.LastError;
            if (s.LastError != "" && s.LastErrorAt == null) s.LastErrorAt = _snap.LastErrorAt;
            if (!string.IsNullOrEmpty(currentError)) { s.LastError = currentError; s.LastErrorAt = DateTime.Now; }
            if (s.TodayVerified && !s.StaleData) { s.LastError = ""; s.LastErrorAt = null; }
            s.DiagEvents = _diagEvents;
            s.DiagLands = _diagLands;
            s.DiagErrors = _diagErrors;
            _snap = s;
        }

        private static string CheckLabel(string id) => id.StartsWith("fruit-sale", StringComparison.Ordinal) ? "果实出售" : id switch {
            "daily-tasks" => "每日任务", "friend-interaction" => "好友互动", "farm" => "收获补种",
            "free-fertilizer" => "免费化肥", "free-benefits" => "每日福利", "vip-daily" => "会员每日礼",
            "vip-rewards" => "会员奖励", "final-state" => "土地复核", "replant" => "补种", "erase-dead" => "铲除枯死",
            "harvest" => "收获", "fertilize" => "施肥",
            "task-discovery" => "任务读取", "task-harvest" => "采摘任务", "task-login" => "登录任务", "task-friend" => "好友任务", _ => id
        };

        private sealed class Evt
        {
            public string Type = "";
            public string Status = "";
            public DateTime? Time;
            public int CodeLen;
            public string CodeFp = "";
            public string Name = "";
            public long Gid;
            public int Level;
            public long Gold;
            public long Exp;
            public int BigLevel;
            public long BigExp;
            public long MinMatureAt;
            public long LastGrowAt;
        public long Points;
        public long Diamonds;
        public double FertHours;
        public double FertOrgHours;
        public long Sec;
        public long NeedSec;
        public long HaveSec;
            public List<LandRow> Lands;
            public int Planted;
            public int DeadCount;
            public string Error = "";
        }

        private IEnumerable<Evt> ReadTailEvents(int maxBytes)
        {
            var list = new List<Evt>();
            _diagEvents = 0; _diagLands = 0; _diagErrors = 0;
            if (!File.Exists(_capture)) return list;
            string text;
            try
            {
                using (var fs = new FileStream(_capture, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    long len = fs.Length;
                    int take = (int)Math.Min(len, maxBytes);
                    fs.Seek(len - take, SeekOrigin.Begin);
                    var buf = new byte[take];
                    int read = 0, n;
                    while (read < take && (n = fs.Read(buf, read, take - read)) > 0) read += n;
                    text = Encoding.UTF8.GetString(buf, 0, read);
                }
            }
            catch { return list; }

            foreach (var line in text.Split('\n'))
            {
                var l = line.Trim();
                if (l.Length < 2 || l[0] != '{') continue;
                try
                {
                    using (var doc = JsonDocument.Parse(l))
                    {
                        var r = doc.RootElement;
                        var e = new Evt();
                        JsonElement x;
                        if (r.TryGetProperty("type", out x)) e.Type = x.GetString() ?? "";
                        if (r.TryGetProperty("t", out x) && DateTime.TryParse(x.GetString(), null, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var dt))
                            e.Time = dt.ToLocalTime();
                        if (r.TryGetProperty("status", out x) && x.ValueKind == JsonValueKind.String) e.Status = x.GetString() ?? "";
                        if (r.TryGetProperty("codeLen", out x)) e.CodeLen = x.GetInt32();
                        if (r.TryGetProperty("codeSha16", out x)) e.CodeFp = x.GetString() ?? "";
                        if (r.TryGetProperty("fp", out x) && x.ValueKind == JsonValueKind.Object)
                        {
                            JsonElement a, b;
                            if (x.TryGetProperty("versionNibble", out a) && x.TryGetProperty("variantNibble", out b))
                                e.CodeFp = (a.GetString() ?? "") + (b.GetString() ?? "");
                        }
                        if (r.TryGetProperty("name", out x) && x.ValueKind == JsonValueKind.String) e.Name = x.GetString();
                        if (r.TryGetProperty("gid", out x) && x.ValueKind == JsonValueKind.String) long.TryParse(x.GetString(), out e.Gid);
                        if (r.TryGetProperty("level", out x) && x.ValueKind == JsonValueKind.Number) e.Level = x.GetInt32();
                        if (r.TryGetProperty("gold", out x) && x.ValueKind == JsonValueKind.Number) e.Gold = x.GetInt64();
                        if (r.TryGetProperty("exp", out x) && x.ValueKind == JsonValueKind.Number) e.Exp = x.GetInt64();
                        if (r.TryGetProperty("big_farm_level", out x) && x.ValueKind == JsonValueKind.Number) e.BigLevel = x.GetInt32();
                        if (r.TryGetProperty("big_farm_exp", out x) && x.ValueKind == JsonValueKind.Number) e.BigExp = x.GetInt64();
                        if (r.TryGetProperty("minMatureAt", out x) && x.ValueKind == JsonValueKind.Number) e.MinMatureAt = x.GetInt64();
                        if (r.TryGetProperty("lastGrowAt", out x) && x.ValueKind == JsonValueKind.Number) e.LastGrowAt = x.GetInt64();
                        if (r.TryGetProperty("deadCount", out x) && x.ValueKind == JsonValueKind.Number) e.DeadCount = x.GetInt32();
                        if (r.TryGetProperty("points", out x) && x.ValueKind == JsonValueKind.Number) e.Points = x.GetInt64();
                        if (r.TryGetProperty("diamonds", out x) && x.ValueKind == JsonValueKind.Number) e.Diamonds = x.GetInt64();
                        if (r.TryGetProperty("fertHours", out x) && x.ValueKind == JsonValueKind.Number) e.FertHours = x.GetDouble();
                        if (r.TryGetProperty("fertOrgHours", out x) && x.ValueKind == JsonValueKind.Number) e.FertOrgHours = x.GetDouble();
                        if (r.TryGetProperty("sec", out x) && x.ValueKind == JsonValueKind.Number) e.Sec = x.GetInt64();
                        if (r.TryGetProperty("needSec", out x) && x.ValueKind == JsonValueKind.Number) e.NeedSec = x.GetInt64();
                        if (r.TryGetProperty("haveSec", out x) && x.ValueKind == JsonValueKind.Number) e.HaveSec = x.GetInt64();
                        if (r.TryGetProperty("lands", out x) && x.ValueKind == JsonValueKind.Array)
                        {
                            e.Lands = new List<LandRow>();
                            foreach (var le in x.EnumerateArray())
                            {
                                var lr = new LandRow();
                                JsonElement y;
                                if (le.TryGetProperty("id", out y) && y.ValueKind == JsonValueKind.Number) lr.Id = y.GetInt32();
                                if (le.TryGetProperty("crop", out y) && y.ValueKind == JsonValueKind.String) lr.Crop = y.GetString();
                                if (le.TryGetProperty("matureAt", out y) && y.ValueKind == JsonValueKind.Number) lr.MatureAt = y.GetInt64();
                                if (le.TryGetProperty("growAt", out y) && y.ValueKind == JsonValueKind.Number) lr.GrowAt = y.GetInt64();
                                if (le.TryGetProperty("phase", out y) && y.ValueKind == JsonValueKind.Number) lr.Phase = y.GetInt64();
                                e.Lands.Add(lr);
                            }
                        }
                        if (r.TryGetProperty("lands", out x) && x.ValueKind == JsonValueKind.Number) e.Planted = x.GetInt32();
                        if (r.TryGetProperty("planted", out x) && x.ValueKind == JsonValueKind.Number) e.Planted = x.GetInt32();
                        if (r.TryGetProperty("err", out x)) e.Error = x.ValueKind == JsonValueKind.String ? x.GetString() : x.ToString();
                        list.Add(e);
                        _diagEvents++;
                        if (e.Lands != null) _diagLands++;
                    }
                }
                catch { _diagErrors++; }
            }
            return list;
        }

        // ── 展示 ────────────────────────────────────────────
        private void UpdateUi()
        {
            _icon.Text = BuildTrayTooltip(_snap, DueAt());

            if (_detail != null && _detail.Visible) _detail.UpdateData(_snap, DueAt());
        }

        internal static string BuildTrayTooltip(Snapshot s, DateTime? due)
        {
            string account = s.ProfileName.Length > 0
                ? Truncate(s.ProfileName, 18) + "  Lv." + s.Level + "  金币 " + Nice(s.Gold) : "QQ 农场";
            bool claimed = s.DailyTotal > 0 && s.DailyClaimed == s.DailyTotal;
            string daily = "日常 " + s.DailyClaimed + "/" + (s.DailyTotal > 0 ? s.DailyTotal : 3) +
                (claimed ? "  已领取" : s.DailyTotal > 0 ? "  待处理" : "  待检查");
            string next = s.PassRunning ? "正在检查…" : !s.QqRunning ? "等待 QQ 运行" : due.HasValue
                ? "下次检查 " + new DateTimeOffset(due.Value).ToOffset(TimeSpan.FromHours(8)).ToString("MM/dd HH:mm:ss") : "下次检查 —";
            return Truncate(string.Join("\n", account, daily, next), 127);
        }

        private List<string> BuildLines(bool full)
        {
            var s = _snap;
            var L = new List<string>();
            L.Add("QQ经典农场");
            L.Add("");
            if (s.ProfileName.Length > 0)
            {
                L.Add("名字    " + s.ProfileName);
                L.Add("等级    " + s.Level + "  经验 " + Nice(s.Exp));
                L.Add("金币    " + Nice(s.Gold));
                if (s.BigLevel > 0) L.Add("大农场  Lv." + s.BigLevel + "  " + Nice(s.BigExp) + " 经验");
            }
            else L.Add("名字    （尚未登录）");
            L.Add("");
            L.Add("QQ      " + (s.QqRunning ? "运行中 · " + s.QqCount + " 进程" : "未运行"));
            L.Add("接入    当前 QQ 会话 · 离线 TSDK");
            L.Add("模式    24 块整批循环，日常刷新后处理");
            L.Add("");
            L.Add("作物    " + s.Planted + " 块");
            L.Add("化肥（含背包） 普通 " + DashboardTheme.Hours(s.FertHours + s.FertBagHours) + "；有机 " + DashboardTheme.Hours(s.FertOrgHours + s.FertOrgBagHours));
            if (s.HasFertilizerPlan) L.Add(DashboardTheme.FertilizerText(s));
            if (s.NextFertileAt > 0)
            {
                var ft = DateTimeOffset.FromUnixTimeSeconds(s.NextFertileAt).LocalDateTime;
                L.Add("催熟    " + ft.ToString("MM-dd HH:mm") + "（" + Human(ft - DateTime.Now) + "后，上化肥）");
            }
            if (s.NextMatureAt > 0)
            {
                var mt = DateTimeOffset.FromUnixTimeSeconds(s.NextMatureAt).LocalDateTime;
                L.Add("成熟    " + mt.ToString("MM-dd HH:mm") + "（" + Human(mt - DateTime.Now) + "后）");
            }
            else L.Add("成熟    --");
            if (s.DeadLands > 0) L.Add("枯死    " + s.DeadLands + " 块（随整批重置铲除补种）");
            L.Add("上次巡检 " + (s.LastPass.HasValue ? s.LastPass.Value.ToString("MM-dd HH:mm:ss") : "无"));
            L.Add("日常验收 " + s.Verification);
            if (s.LastSuccess.HasValue) L.Add("上次成功 " + s.LastSuccess.Value.ToString("MM-dd HH:mm:ss"));
            var due = DueAt();
            L.Add("下次巡检 " + (s.PassRunning ? "进行中" : (due.HasValue ? due.Value.ToString("MM-dd HH:mm:ss") + "（" + Human(due.Value - DateTime.Now) + "后）" : "--")));
            if (s.LastError.Length > 0) { L.Add(""); L.Add("最近错误 " + s.LastError); }
            if (full)
            {
                L.Add("");
                L.Add("── 调试 ──");
                L.Add("GID     " + (s.Gid > 0 ? s.Gid.ToString() : "-"));
                L.Add("最近事件 " + (s.LastEvent.HasValue ? s.LastEvent.Value.ToString("HH:mm:ss") + " " + s.LastType : "-"));
                L.Add("日志    " + _capture);
                L.Add("根目录  " + _root);
                L.Add("配置    " + _configPath);
                if (_log.Length > 0) { L.Add(""); L.Add("── 操作记录 ──"); L.Add(_log.ToString().TrimEnd()); }
            }
            return L;
        }

        private static string Nice(long v)
        {
            if (v >= 100000000) return (v / 100000000.0).ToString("0.##") + "亿";
            if (v >= 10000) return (v / 10000.0).ToString("0.##") + "万";
            return v.ToString();
        }

        private static string Human(TimeSpan t)
        {
            if (t.TotalSeconds < 0) return "已到期";
            if (t.TotalDays >= 1) return ((int)t.TotalDays) + "天" + t.Hours + "小时";
            if (t.TotalHours >= 1) return ((int)t.TotalHours) + "小时" + t.Minutes + "分";
            if (t.TotalMinutes >= 1) return ((int)t.TotalMinutes) + "分" + t.Seconds + "秒";
            return ((int)t.TotalSeconds) + "秒";
        }

        private static string Truncate(string s, int n) { return s.Length <= n ? s : s.Substring(0, n); }

        private void Append(string s)
        {
            _log.AppendLine(DateTime.Now.ToString("HH:mm:ss") + " " + s);
            if (_log.Length > 4000) _log.Remove(0, _log.Length - 3000);
        }

        private void ShowDetail()
        {
            if (_detail == null || _detail.IsDisposed)
            {
                _detail = new DetailForm(
                    () => RunPass(true),
                    () => OpenLogs(),
                    () => { Clipboard.SetText(string.Join(Environment.NewLine, BuildLines(true))); });
            }
            _detail.UpdateData(_snap, DueAt());
            _detail.Show();
            _detail.BringToFront();
            _detail.Activate();
        }

        private void OpenLogs()
        {
            try { Process.Start("explorer.exe", Path.GetDirectoryName(_capture)); } catch { }
        }

        // ── 自启动 ──────────────────────────────────────────
        private static string StartupLnk()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup), "FarmTray.lnk");
        }

        private static bool IsAutostartEnabled() { return File.Exists(StartupLnk()); }

        internal static void SetAutostart(bool on)
        {
            try
            {
                var lnk = StartupLnk();
                if (!on) { if (File.Exists(lnk)) File.Delete(lnk); return; }
                var t = Type.GetTypeFromProgID("WScript.Shell");
                dynamic sh = Activator.CreateInstance(t);
                dynamic sc = sh.CreateShortcut(lnk);
                sc.TargetPath = Application.ExecutablePath;
                sc.WorkingDirectory = AppContext.BaseDirectory;
                sc.Description = "QQ 经典农场托盘";
                sc.Save();
            }
            catch { }
        }

        private void ExitApp()
        {
            _poll.Stop();
            _passCancellation?.Cancel();
            _icon.Visible = false;
            if (_detail != null && !_detail.IsDisposed) _detail.Close();
            ExitThread();
        }
    }

}
