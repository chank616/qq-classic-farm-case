using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Windows.Forms;

namespace FarmTray
{
    internal sealed class DailyTaskRow
    {
        public int Condition;
        public bool Claimed;
        public int Progress, Total;
    }

    internal static class DashboardTheme
    {
        internal static readonly Color Green = Color.FromArgb(43, 104, 65);
        internal static string Duration(TimeSpan value)
        {
            if (value.TotalSeconds <= 0) return "已成熟";
            if (value.TotalDays >= 1) return (int)value.TotalDays + "天 " + value.Hours + "时";
            return (int)value.TotalHours + "时 " + value.Minutes.ToString("00") + "分 " + value.Seconds.ToString("00") + "秒";
        }
        internal static string Clock(long seconds) => seconds > 0
            ? DateTimeOffset.FromUnixTimeSeconds(seconds).ToOffset(TimeSpan.FromHours(8)).ToString("MM/dd HH:mm") : "—";
        internal static string Hours(double hours) => ((int)hours) + "时" + ((int)(hours * 60) % 60).ToString("00") + "分";
        internal static string FertilizerText(Snapshot s) => !s.HasFertilizerPlan ? "化肥预算：待检查" : s.FertNeedSec <= 0
            ? s.Planted > 0 && s.Lands.Count > 0 && s.Lands.All(l => l.MatureAt > 0 && l.MatureAt <= DateTimeOffset.UtcNow.ToUnixTimeSeconds())
                ? "整批已成熟，无需施肥" : "本批无需施肥"
            : "整批需 " + Hours(s.FertNeedSec / 3600.0) + "；" + (!s.FertilizerSufficient ? "当前不够，等自然成熟"
                : s.PlannedPoints > 0 ? "点券补缺 " + s.PlannedPoints + " 点" : "容器和背包足够，无需购买");
    }

    internal sealed class NativeLandTable : ListView
    {
        public NativeLandTable() { DoubleBuffered = true; }
    }

    internal sealed class DetailForm : Form
    {
        private readonly Label _account, _gold, _points, _normal, _organic, _cropClock, _fertBudget;
        private readonly Label[] _tasks = new Label[5];
        private readonly GroupBox _daily, _landGroup;
        private readonly ToolStripStatusLabel _connection, _next, _footer;
        private readonly Button _run;
        private readonly NativeLandTable _lands;
        private readonly ToolTip _tips = new ToolTip();
        private int P(int value) => (int)Math.Round(value * DeviceDpi / 96f);

        public DetailForm(Action runPass, Action openLogs, Action copy)
        {
            Text = "QQ 农场";
            AutoScaleMode = AutoScaleMode.None;
            Font = SystemFonts.MessageBoxFont;
            ClientSize = new Size(P(760), P(540)); MinimumSize = new Size(P(700), P(440));
            BackColor = SystemColors.Control; ForeColor = SystemColors.ControlText;
            StartPosition = FormStartPosition.CenterScreen;
            using (var stream = typeof(DetailForm).Assembly.GetManifestResourceStream("farm.ico"))
                if (stream != null) Icon = new Icon(stream);

            var status = new StatusStrip { SizingGrip = true, Font = Font, ShowItemToolTips = true,
                LayoutStyle = ToolStripLayoutStyle.HorizontalStackWithOverflow };
            _connection = new ToolStripStatusLabel("等待 QQ") { AutoSize = false, Width = P(84), BorderSides = ToolStripStatusLabelBorderSides.Right };
            _footer = new ToolStripStatusLabel("尚无检查记录") { TextAlign = ContentAlignment.MiddleLeft };
            _next = new ToolStripStatusLabel("下次检查 —") { Alignment = ToolStripItemAlignment.Right,
                Overflow = ToolStripItemOverflow.Never, TextAlign = ContentAlignment.MiddleRight };
            status.Items.AddRange(new ToolStripItem[] { _connection, _footer, _next });

            var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 4,
                Padding = new Padding(P(10), P(8), P(10), P(4)), Margin = Padding.Empty };
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, P(80)));
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, P(72)));
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, P(38)));

            var accountGroup = Group("账号与资源 · 化肥含背包道具");
            var accountRows = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, Margin = Padding.Empty };
            accountRows.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            accountRows.RowStyles.Add(new RowStyle(SizeType.Percent, 50)); accountRows.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
            _account = Label("等待农场数据"); _account.Font = new Font(Font, FontStyle.Bold);
            accountRows.Controls.Add(_account, 0, 0);
            var metrics = Columns(29, 19, 26, 26);
            _gold = Label("金币：—"); _points = Label("点券：—");
            _normal = Label("普通肥：—"); _organic = Label("有机肥：—");
            metrics.Controls.Add(_gold, 0, 0); metrics.Controls.Add(_points, 1, 0);
            metrics.Controls.Add(_normal, 2, 0); metrics.Controls.Add(_organic, 3, 0);
            accountRows.Controls.Add(metrics, 0, 1); accountGroup.Controls.Add(accountRows); root.Controls.Add(accountGroup, 0, 0);

            _daily = Group("今日日常");
            var taskGrid = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 5, RowCount = 2, Margin = Padding.Empty };
            taskGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 50)); taskGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
            var names = new[] { "登录奖励", "采摘奖励", "互动奖励", "会员福利", "免费化肥" };
            for (int i = 0; i < 5; i++) {
                taskGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 20));
                taskGrid.Controls.Add(Label(names[i]), i, 0);
                _tasks[i] = Label("待检查"); taskGrid.Controls.Add(_tasks[i], i, 1);
            }
            _daily.Controls.Add(taskGrid); root.Controls.Add(_daily, 0, 1);

            _landGroup = Group("整批种收 · 24 块地");
            var landRows = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3, Margin = Padding.Empty };
            landRows.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            landRows.RowStyles.Add(new RowStyle(SizeType.Absolute, P(24)));
            landRows.RowStyles.Add(new RowStyle(SizeType.Absolute, P(22))); landRows.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            _cropClock = Label("整批可催熟：—    整批成熟：—"); landRows.Controls.Add(_cropClock, 0, 0);
            _fertBudget = Label("化肥预算：待检查"); landRows.Controls.Add(_fertBudget, 0, 1);
            _lands = new NativeLandTable { Dock = DockStyle.Fill, View = View.Details, FullRowSelect = true,
                GridLines = false, HeaderStyle = ColumnHeaderStyle.Nonclickable, BorderStyle = BorderStyle.Fixed3D,
                HideSelection = false, ShowItemToolTips = true, Margin = Padding.Empty,
                BackColor = SystemColors.Window, ForeColor = SystemColors.WindowText, Font = Font, AccessibleName = "地块明细" };
            foreach (var title in new[] { "地块", "作物", "成熟倒计时", "可催熟时间", "成熟时间" }) _lands.Columns.Add(title);
            _lands.Resize += (_, _) => {
                ResizeColumns();
                if (_lands.IsHandleCreated) _lands.BeginInvoke((Action)ResizeColumns);
            };
            landRows.Controls.Add(_lands, 0, 2); _landGroup.Controls.Add(landRows); root.Controls.Add(_landGroup, 0, 2);

            var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft,
                WrapContents = false, Margin = Padding.Empty, Padding = new Padding(0, P(6), 0, 0) };
            _run = Button("立即检查(&R)", runPass);
            actions.Controls.Add(_run);
            actions.Controls.Add(Button("运行记录(&L)", openLogs)); actions.Controls.Add(Button("复制状态(&C)", copy));
            root.Controls.Add(actions, 0, 3); Controls.Add(root); Controls.Add(status);
        }

        private GroupBox Group(string title) => new GroupBox { Text = title, Dock = DockStyle.Fill,
            Padding = new Padding(P(10), P(2), P(10), P(8)), Margin = new Padding(0, 0, 0, P(6)) };
        private TableLayoutPanel Columns(params int[] proportions)
        {
            var panel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = proportions.Length, RowCount = 1, Margin = Padding.Empty };
            foreach (int part in proportions) panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, part));
            panel.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); return panel;
        }
        private Label Label(string text) => new Label { Text = text, Dock = DockStyle.Fill, AutoEllipsis = true,
            TextAlign = ContentAlignment.MiddleLeft, Margin = Padding.Empty, UseMnemonic = false };
        private Button Button(string text, Action action)
        {
            var b = new Button { Text = text, Size = new Size(P(96), P(26)), FlatStyle = FlatStyle.Standard,
                UseVisualStyleBackColor = true, Margin = new Padding(P(6), 0, 0, 0), AccessibleName = text.Replace("&", "") };
            b.Click += (_, _) => action(); return b;
        }
        private void ResizeColumns()
        {
            if (_lands.Columns.Count != 5) return;
            int available = Math.Max(100, _lands.ClientSize.Width - SystemInformation.VerticalScrollBarWidth - 4);
            double[] widths = { .08, .20, .24, .24, .24 };
            _lands.BeginUpdate();
            try { for (int i = 0; i < widths.Length; i++) _lands.Columns[i].Width = (int)(available * widths[i]); }
            finally { _lands.EndUpdate(); }
        }
        public void UpdateData(Snapshot s, DateTime? due)
        {
            _account.Text = s.ProfileName.Length > 0 ? s.ProfileName + "    等级 " + s.Level : "等待农场数据";
            _connection.Text = s.QqRunning ? "QQ 运行中" : "QQ 未运行";
            _gold.Text = "金币：" + (s.ProfileName.Length > 0 ? s.Gold.ToString("N0") : "—");
            _points.Text = "点券：" + (s.ProfileName.Length > 0 ? s.Points.ToString("N0") : "—");
            _normal.Text = "普通肥：" + (s.ProfileName.Length > 0 ? DashboardTheme.Hours(s.FertHours + s.FertBagHours) : "—");
            _organic.Text = "有机肥：" + (s.ProfileName.Length > 0 ? DashboardTheme.Hours(s.FertOrgHours + s.FertOrgBagHours) : "—");
            _tips.SetToolTip(_normal, "容器 " + Math.Round(s.FertHours * 3600).ToString("N0") + " 秒；背包 " + Math.Round(s.FertBagHours * 3600).ToString("N0") + " 秒");
            _tips.SetToolTip(_organic, "容器 " + Math.Round(s.FertOrgHours * 3600).ToString("N0") + " 秒；背包 " + Math.Round(s.FertOrgBagHours * 3600).ToString("N0") + " 秒");
            _daily.Text = "今日日常  " + s.DailyClaimed + "/" + (s.DailyTotal > 0 ? s.DailyTotal : 3) + (s.StaleData ? " · 上次数据" : "");
            int[] conditions = { 16, 17, 18 };
            for (int i = 0; i < 3; i++) {
                var row = s.DailyTasks.FirstOrDefault(t => t.Condition == conditions[i]);
                _tasks[i].Text = row == null ? "待检查" : row.Claimed ? "已领取" : row.Total > 0 && row.Progress >= row.Total ? "待领取" : "待完成";
                _tasks[i].ForeColor = row?.Claimed == true ? DashboardTheme.Green : SystemColors.ControlText;
            }
            _tasks[3].Text = s.VipVerified ? (s.VipSkipped ? "无需领取" : "已核实") : "待检查";
            _tasks[4].Text = s.FreeFertVerified ? (s.FreeFertSkipped ? "无需领取" : "已核实") : "待检查";
            for (int i = 3; i < 5; i++) _tasks[i].ForeColor = (i == 3 ? s.VipVerified : s.FreeFertVerified) ? DashboardTheme.Green : SystemColors.ControlText;
            _tips.SetToolTip(_tasks[3], s.VipSkipped ? "服务端说明本账号非会员或今日无会员奖励，无需领取" : "会员每日礼与会员奖励按服务端 claimed_today 核实");
            _tips.SetToolTip(_tasks[4], s.FreeFertSkipped ? "服务端说明本账号没有可领取的免费化肥商品" : "免费化肥按购买结果与限购计数核实");
            _next.Text = s.PassRunning ? "正在检查…" : !s.QqRunning ? "等待 QQ 运行" : due.HasValue
                ? "下次检查 " + new DateTimeOffset(due.Value).ToOffset(TimeSpan.FromHours(8)).ToString("HH:mm:ss") : "下次检查 —";
            _landGroup.Text = "整批种收 · 24 块地    " + Math.Max(0, s.Planted - s.DeadLands) + "/24 已种植" +
                (s.DeadLands > 0 ? " · " + s.DeadLands + " 块待整批清理" : "") + (s.StaleData ? " · 上次数据" : "");
            _cropClock.Text = "整批可催熟：" + DashboardTheme.Clock(s.NextFertileAt) + "    整批成熟：" + DashboardTheme.Clock(s.NextMatureAt);
            _fertBudget.Text = DashboardTheme.FertilizerText(s);
            _run.Enabled = !s.PassRunning && s.QqRunning; _run.Text = s.PassRunning ? "检查中…" : "立即检查(&R)";
            _footer.Text = s.LastPass.HasValue ? "最近检查 " + new DateTimeOffset(s.LastPass.Value).ToOffset(TimeSpan.FromHours(8)).ToString("HH:mm:ss") : "尚无检查记录";
            _footer.ToolTipText = s.LastError;
            if (!s.TodayVerified)
            {
                // 只有本轮真正抛错才叫“检查失败”；仅剩未核实项时直接点名，避免看起来像整体失败。
                string pending = s.Verification ?? "";
                int colon = pending.IndexOf('：');
                if (colon >= 0) pending = pending.Substring(colon + 1);
                if (s.LastError.Length > 0) { _footer.Text = "检查失败 · 查看运行记录"; _footer.ToolTipText = s.LastError; }
                else if (colon >= 0 && pending.Length > 0) { _footer.Text = "未核实 · " + pending; _footer.ToolTipText = s.Verification; }
                else { _footer.Text = "今日验收未完成"; _footer.ToolTipText = s.Verification; }
                _footer.ForeColor = Color.Firebrick;
            }
            else _footer.ForeColor = SystemColors.ControlText;
            if (s.WaitingForBridge) { _footer.Text = "QQ 后台接入未完成"; _footer.ForeColor = Color.Firebrick; _next.Text = "不会自动启动农场"; }
            if (s.StaleData && s.DataAt.HasValue) _footer.ToolTipText = "上次数据 " + s.DataAt.Value.ToString("MM/dd HH:mm:ss") + "；" + s.LastError;
            var lands = s.Lands.OrderBy(l => l.Id).ToList();
            bool rebuild = _lands.Items.Count != lands.Count || lands.Where((l, i) => _lands.Items[i].Text != l.Id.ToString("00")).Any();
            _lands.BeginUpdate();
            try {
                if (rebuild) {
                    _lands.Items.Clear();
                    foreach (var land in lands) {
                        var item = new ListViewItem(land.Id.ToString("00"));
                        for (int i = 0; i < 4; i++) item.SubItems.Add("");
                        _lands.Items.Add(item);
                    }
                }
                for (int i = 0; i < lands.Count; i++) {
                    var land = lands[i]; var row = _lands.Items[i];
                    bool dead = land.Phase == 7;
                    string[] cells = { land.Crop.Length > 0 ? land.Crop : "空地",
                        dead ? "枯死" : land.MatureAt > 0 ? DashboardTheme.Duration(DateTimeOffset.FromUnixTimeSeconds(land.MatureAt) - DateTimeOffset.UtcNow) : "—",
                        dead ? "—" : DashboardTheme.Clock(land.GrowAt), dead ? "—" : DashboardTheme.Clock(land.MatureAt) };
                    for (int j = 0; j < cells.Length; j++) if (row.SubItems[j + 1].Text != cells[j]) row.SubItems[j + 1].Text = cells[j];
                    row.ToolTipText = land.Crop + " · 第 " + land.Id + " 块地" + (dead ? " · 枯死，随整批重置铲除" : "");
                    row.ForeColor = land.Crop.Length == 0 ? SystemColors.GrayText : dead ? SystemColors.GrayText
                        : land.MatureAt > 0 && land.MatureAt <= DateTimeOffset.UtcNow.ToUnixTimeSeconds() ? DashboardTheme.Green : SystemColors.WindowText;
                }
            } finally { _lands.EndUpdate(); }
            if (rebuild) ResizeColumns();
        }
        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e); ResizeColumns();
            var work = Screen.FromControl(this).WorkingArea;
            if (Height > work.Height - 24) Height = work.Height - 24;
            if (Width > work.Width - 24) Width = work.Width - 24;
            Location = new Point(work.Left + (work.Width - Width) / 2, work.Top + (work.Height - Height) / 2);
        }
        protected override void Dispose(bool disposing) { if (disposing) _tips.Dispose(); base.Dispose(disposing); }
    }

    internal static class DashboardData
    {
        internal static void ApplyBatchClock(Snapshot s)
        {
            var planted = s.Lands.Where(l => l.MatureAt > 0).ToList();
            s.NextMatureAt = planted.Count > 0 ? planted.Max(l => l.MatureAt) : 0;
            if (s.HasFertilizerPlan) {
                s.NextFertileAt = s.PlannedFertileAt; s.FertNeedSec = s.PlannedNeedSec;
                s.FertHours = s.PlannedNormalHours; s.FertOrgHours = s.PlannedOrganicHours; s.Points = s.PlannedPointBalance;
                return;
            }
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var unripe = planted.Where(l => l.MatureAt > now).ToList();
            s.NextFertileAt = 0;
            if (s.Lands.Count != 24 || unripe.Count == 0 || unripe.Any(l => l.GrowAt <= 0)) return;
            long growth = unripe.Max(l => l.GrowAt);
            long need = unripe.Sum(l => Math.Max(0, l.MatureAt - Math.Max(now, growth)));
            if (s.FertHaveSec >= need) s.NextFertileAt = growth;
        }

        internal static void ApplyReport(Snapshot s, JsonElement report)
        {
            bool today = report.TryGetProperty("day", out var day) && day.GetString() == DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-dd");
            if (report.TryGetProperty("day", out var checkedDay)) s.DailyCheckedDay = checkedDay.GetString() ?? "";
            s.TodayVerified = today && report.TryGetProperty("allRequiredComplete", out var complete) && complete.GetBoolean();
            if (report.TryGetProperty("account", out var account))
            {
                if (account.TryGetProperty("name", out var name)) s.ProfileName = name.GetString() ?? "";
                if (account.TryGetProperty("level", out var level)) s.Level = level.GetInt32();
            }
            if (report.TryGetProperty("daily", out var daily) && today)
            {
                s.DailyClaimed = daily.GetProperty("claimed").GetInt32(); s.DailyTotal = daily.GetProperty("observed").GetInt32();
                foreach (var t in daily.GetProperty("tasks").EnumerateArray()) s.DailyTasks.Add(new DailyTaskRow {
                    Condition = t.GetProperty("cond").GetInt32(), Claimed = t.GetProperty("claimed").GetBoolean(),
                    Progress = t.GetProperty("progress").GetInt32(), Total = t.GetProperty("total").GetInt32() });
            }
            if (report.TryGetProperty("checks", out var checks) && today)
            {
                string Status(string id)
                {
                    foreach (var c in checks.EnumerateArray())
                        if (c.TryGetProperty("id", out var cid) && cid.GetString() == id && c.TryGetProperty("status", out var st))
                            return st.GetString() ?? "";
                    return "";
                }
                // not-applicable 表示服务端明确说明本账号无需或无权领取，属于已核实，而不是待补项目。
                bool Settled(string id) => Status(id) is "passed" or "not-applicable";
                s.VipVerified = Settled("vip-daily") && Settled("vip-rewards");
                s.VipSkipped = Status("vip-daily") == "not-applicable" || Status("vip-rewards") == "not-applicable";
                s.FreeFertVerified = Settled("free-fertilizer");
                s.FreeFertSkipped = Status("free-fertilizer") == "not-applicable";
            }
            if (report.TryGetProperty("cropClock", out var crop))
            {
                s.NextMatureAt = crop.GetProperty("minMatureAt").GetInt64(); s.NextFertileAt = crop.GetProperty("lastGrowAt").GetInt64();
                s.Planted = crop.GetProperty("planted").GetInt32();
                if (crop.TryGetProperty("deadCount", out var deadCount)) s.DeadLands = deadCount.GetInt32();
                s.Lands = crop.GetProperty("lands").EnumerateArray().Select(l => new LandRow {
                    Id = l.GetProperty("id").GetInt32(), Crop = l.GetProperty("crop").GetString() ?? "",
                    MatureAt = l.GetProperty("matureAt").GetInt64(), GrowAt = l.GetProperty("growAt").GetInt64(),
                    Phase = l.TryGetProperty("phase", out var phase) ? phase.GetInt64() : 0 }).ToList();
                if (report.TryGetProperty("fertilizer", out var fertilizer)) {
                    s.HasFertilizerPlan = true;
                    s.PlannedFertileAt = crop.GetProperty("batchFertilizeAt").GetInt64();
                    s.PlannedNeedSec = fertilizer.GetProperty("needSec").GetInt64();
                    s.PlannedNormalHours = fertilizer.GetProperty("normalBucketSec").GetDouble() / 3600;
                    s.PlannedOrganicHours = fertilizer.GetProperty("organicBucketSec").GetDouble() / 3600;
                    s.PlannedPointBalance = fertilizer.GetProperty("points").GetInt64();
                    s.FertBagHours = fertilizer.GetProperty("normalBagSec").GetDouble() / 3600;
                    s.FertOrgBagHours = fertilizer.GetProperty("organicBagSec").GetDouble() / 3600;
                    s.PlannedPoints = fertilizer.GetProperty("pointsCost").GetInt64();
                    s.FertilizerSufficient = fertilizer.GetProperty("sufficient").GetBoolean();
                }
            }
            if (report.TryGetProperty("finishedAt", out var finished) && DateTime.TryParse(finished.GetString(), out var at)) s.LastPass = at.ToLocalTime();
        }
    }

    internal static class DashboardPreview
    {
        internal static void Render()
        {
            var root = AppContext.BaseDirectory;
            while (!File.Exists(Path.Combine(root, "artifacts", "farm-status.json")) && Directory.GetParent(root) != null) root = Directory.GetParent(root).FullName;
            var s = new Snapshot();
            using (var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "artifacts", "farm-status.json")))) DashboardData.ApplyReport(s, doc.RootElement);
            foreach (var line in File.ReadLines(Path.Combine(root, "artifacts", "m0-code-capture.jsonl")).Where(l => l.Contains("\"type\":\"profile\"")))
            {
                using var doc = JsonDocument.Parse(line); var p = doc.RootElement;
                if (p.TryGetProperty("gold", out var gold)) s.Gold = gold.GetInt64();
                if (p.TryGetProperty("points", out var points)) s.Points = points.GetInt64();
                if (p.TryGetProperty("fertHours", out var fert)) s.FertHours = fert.GetDouble();
                if (p.TryGetProperty("fertOrgHours", out var organic)) s.FertOrgHours = organic.GetDouble();
            }
            DateTime? due = null;
            using (var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "artifacts", "tray-status.json"))))
            {
                var p = doc.RootElement; s.QqRunning = p.GetProperty("qqRunning").GetBoolean(); s.SinkUp = p.GetProperty("sinkUp").GetBoolean();
                s.PassRunning = p.GetProperty("passRunning").GetBoolean();
                if (DateTime.TryParse(p.GetProperty("nextDue").GetString(), out var next)) due = next.ToLocalTime();
            }
            s.FertHaveSec = (long)Math.Round(s.FertHours * 3600);
            DashboardData.ApplyBatchClock(s);
            var output = Path.Combine(root, "artifacts", "ui-preview"); Directory.CreateDirectory(output);
            using var form = new DetailForm(() => {}, () => {}, () => {});
            form.UpdateData(s, due); form.Show(); Application.DoEvents();
            IEnumerable<Control> Descendants(Control parent) {
                foreach (Control child in parent.Controls) {
                    yield return child;
                    foreach (var nested in Descendants(child)) yield return nested;
                }
            }
            var table = Descendants(form).OfType<ListView>().Single();
            var run = Descendants(form).OfType<Button>().Single(b => b.AccessibleName.StartsWith("立即检查"));
            if (table.Items.Count > 8) {
                var row = table.Items[8]; row.Selected = true; table.TopItem = row;
                int top = table.TopItem.Index;
                form.UpdateData(s, due); Application.DoEvents();
                if (!ReferenceEquals(row, table.Items[8]) || !row.Selected || table.TopItem.Index != top)
                    throw new Exception("Refreshing the farm table lost selection or scroll position");
                row.Selected = false; table.TopItem = table.Items[0];
            }
            bool wasRunning = s.PassRunning, qqRunning = s.QqRunning;
            s.PassRunning = true; form.UpdateData(s, due);
            if (run.Enabled) throw new Exception("Check button enabled while busy");
            s.PassRunning = false; s.QqRunning = false; form.UpdateData(s, due);
            if (run.Enabled) throw new Exception("Check button enabled without QQ");
            s.PassRunning = wasRunning; s.QqRunning = qqRunning; form.UpdateData(s, due); Application.DoEvents();
            foreach (var strip in form.Controls.OfType<StatusStrip>())
                if (strip.Items.Cast<ToolStripItem>().Any(item => item.Placement != ToolStripItemPlacement.Main))
                    throw new Exception("A status bar item is hidden");
            // 底部文案回归：只有本轮抛错才叫检查失败，仅剩未核实项时点名。
            var bar = form.Controls.OfType<StatusStrip>().Single();
            bool wasTodayVerified = s.TodayVerified, wasStale = s.StaleData, wasBridge = s.WaitingForBridge;
            string wasError = s.LastError, wasVerification = s.Verification;
            s.TodayVerified = false; s.StaleData = false; s.WaitingForBridge = false;
            s.LastError = ""; s.Verification = "仍有未完成或未核实项目：免费化肥、每日福利";
            form.UpdateData(s, due);
            if (bar.Items[1].Text != "未核实 · 免费化肥、每日福利") throw new Exception("Pending items were not named in the footer: " + bar.Items[1].Text);
            s.LastError = "The operation has timed out. @ 20:00:12"; form.UpdateData(s, due);
            if (bar.Items[1].Text != "检查失败 · 查看运行记录") throw new Exception("Current failure was not shown in the footer: " + bar.Items[1].Text);
            s.LastError = ""; s.Verification = "逐项复核通过"; s.TodayVerified = true; form.UpdateData(s, due);
            if (bar.Items[1].Text.StartsWith("检查失败") || bar.Items[1].Text.StartsWith("未核实")) throw new Exception("Verified day still reported a problem: " + bar.Items[1].Text);
            s.TodayVerified = wasTodayVerified; s.StaleData = wasStale; s.WaitingForBridge = wasBridge; s.LastError = wasError; s.Verification = wasVerification;
            form.UpdateData(s, due); Application.DoEvents();
            using (var bitmap = new Bitmap(form.Width, form.Height))
            { form.DrawToBitmap(bitmap, new Rectangle(Point.Empty, form.Size)); bitmap.Save(Path.Combine(output, "dashboard.png"), ImageFormat.Png); }
            form.Size = form.MinimumSize; Application.DoEvents();
            using (var bitmap = new Bitmap(form.Width, form.Height))
            { form.DrawToBitmap(bitmap, new Rectangle(Point.Empty, form.Size)); bitmap.Save(Path.Combine(output, "dashboard-compact.png"), ImageFormat.Png); }
            File.WriteAllText(Path.Combine(output, "tray-tooltip.txt"), TrayContext.BuildTrayTooltip(s, due));
            form.Close();
            Console.WriteLine("UI checks passed: stable rows, selection, scroll position, busy/offline buttons, visible status bar.");
            Console.WriteLine("UI previews: " + output);
        }
    }
}
