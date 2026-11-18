using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using static FarmTray.Native.JsonData;

namespace FarmTray.Native;

internal sealed class FarmBridgeUnavailableException : IOException
{
    internal FarmBridgeUnavailableException() : base("仅登录 QQ 的后台接入尚未实现；已禁止自动启动农场小程序。") { }
}

internal static class QqBootstrap
{
    internal const string FarmUrl = "tencent://ntqq-open/?&subCmd=miniapp&action=openQQMiniApp&actionParams=%7B%22sourceType%22%3A%22open%22%2C%22appId%22%3A%22https%3A%2F%2Fm.q.qq.com%2Fa%2Fp%2F1112386029%3Freferer%3Dpc_shortcut%26via%3Dpc_shortcut%22%2C%22hostScene%22%3A%221246700100%22%7D";
    internal const string Snippet = """
<script>
/*_FARM_BOOT_*/
(function(){
  if(typeof location==='undefined'||String(location.href).indexOf('1112386029')===-1)return;
  function boot(){fetch('http://127.0.0.1:17841/light.js',{cache:'no-store'})
    .then(function(r){if(!r.ok)throw new Error('bridge unavailable');return r.text();})
    .then(function(t){(0,eval)(t);}).catch(function(){setTimeout(boot,5000);});}
  setTimeout(boot,1200);
})();
</script>
""";
    internal static List<string> Install(string customRoot = null)
    {
        string temps = customRoot ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "QQEX", "miniapp", "temps");
        string library = Path.Combine(temps, "miniapp_jslib"), source = Path.Combine(temps, "miniapp_src");
        var templates = Directory.Exists(library) ? Directory.EnumerateDirectories(library).Select(d => Path.Combine(d, "QPageFrame.html")).Where(File.Exists).ToList() : new();
        if (templates.Count == 0) throw new IOException("请先在 QQ 中打开一次农场，尚未发现农场页面模板。");
        var targets = new List<string> { templates.OrderByDescending(File.GetLastWriteTimeUtc).First() };
        if (Directory.Exists(source)) targets.AddRange(Directory.EnumerateDirectories(source, "1112386029_3_*").Select(d => Path.Combine(d, "out_page-frame.html")).Where(File.Exists));
        var changed = new List<string>();
        foreach (string file in targets) {
            string html = File.ReadAllText(file), updated;
            const string pattern = @"<script>\s*/\*_FARM_BOOT_\*/[\s\S]*?</script>";
            if (Regex.IsMatch(html, pattern)) updated = Regex.Replace(html, pattern, _ => Snippet);
            else if (html.Contains("</body>")) updated = html.Replace("</body>", Snippet + "\n</body>");
            else continue;
            updated = Regex.Replace(updated, @"<script>\s*/\*_M0_CODESVC_\*/[\s\S]*?</script>", "");
            if (updated == html) continue;
            if (templates.Contains(file) && !File.Exists(file + ".bootbak")) File.Copy(file, file + ".bootbak");
            File.WriteAllText(file, updated, new UTF8Encoding(false)); changed.Add(file);
        }
        return changed;
    }
    internal static async Task EnsureReady(CancellationToken token)
    {
        if (Process.GetProcessesByName("QQ").Length == 0) throw new IOException("等待已登录的 QQ 运行");
        using var http = new HttpClient { BaseAddress = new Uri("http://127.0.0.1:17841"), Timeout = TimeSpan.FromSeconds(4) };
        if (await ProbeExistingBridge(http, token)) return;
        throw new FarmBridgeUnavailableException();
    }
    internal static async Task<bool> ProbeExistingBridge(HttpClient http, CancellationToken token)
    {
        try {
            var health = JsonNode.Parse(await http.GetStringAsync("/health", token));
            if (!B(health, "hostReady") || !B(health, "hasCode")) return false;
            async Task<JsonObject> Post(string path, JsonObject data) {
                using var response = await http.PostAsync(path, new StringContent(data.ToJsonString(), Encoding.UTF8, "application/json"), token);
                response.EnsureSuccessStatusCode();
                var result = JsonNode.Parse(await response.Content.ReadAsStringAsync(token)) as JsonObject ?? new();
                if (S(result, "error").Length > 0) throw new IOException("QQ bridge probe failed"); return result;
            }
            var encoded = await Post("/bridge", O(("op", "encode"), ("path", "shoppb.ShopInfoRequest"), ("value", O(("shop_id", 2)))));
            if (S(encoded, "b64") != "CAI=") return false;
            var encrypted = FarmTransport.RequireCiphertext(await Post("/crypto-task", O(("op", "e"), ("b64", "CAI="))));
            var decoded = await Post("/crypto-task", O(("op", "d"), ("b64", Convert.ToBase64String(encrypted))));
            return S(decoded, "b64") == "CAI=";
        } catch (OperationCanceledException) when (!token.IsCancellationRequested) { return false; }
        catch (HttpRequestException) { return false; }
        catch (IOException) { return false; }
        catch (System.Text.Json.JsonException) { return false; }
    }
}
