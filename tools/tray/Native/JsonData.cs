using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace FarmTray.Native;

internal static class JsonData
{
    internal static JsonNode Copy(JsonNode n) => n?.DeepClone();
    internal static JsonNode V(object value) => value is JsonNode n ? Copy(n) : JsonSerializer.SerializeToNode(value);
    internal static JsonObject O(params (string Key, object Value)[] values)
    {
        var o = new JsonObject(); foreach (var (k, v) in values) o[k] = V(v); return o;
    }
    internal static JsonArray A(IEnumerable<JsonNode> nodes) => new(nodes.Select(Copy).ToArray());
    internal static JsonArray A(IEnumerable<long> numbers) => new(numbers.Select(n => V(n)).ToArray());
    internal static JsonNode P(JsonNode node, string key) => node is JsonObject o ? o[key] : null;
    internal static List<JsonNode> L(JsonNode node, string key = null) => (key == null ? node : P(node, key)) is JsonArray a ? a.Where(n => n != null).ToList() : new();
    internal static string S(JsonNode node, string key = null)
    {
        var v = key == null ? node : P(node, key);
        return v is JsonValue j && j.TryGetValue<string>(out var s) ? s ?? "" : v?.ToJsonString() ?? "";
    }
    internal static long N(JsonNode node, string key = null)
    {
        var s = S(node, key);
        if (long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n)) return n;
        return double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? checked((long)d) : 0;
    }
    internal static bool B(JsonNode node, string key = null) => S(node, key) is "true" or "1";
    internal static long Now => DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    internal static string Day(long time) => DateTimeOffset.FromUnixTimeSeconds(time).ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-dd");
    internal static void Save(string file, JsonNode value)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(file));
        var temporary = file + "." + Environment.ProcessId + ".tmp";
        File.WriteAllText(temporary, value.ToJsonString(new JsonSerializerOptions { WriteIndented = true }) + "\n");
        File.Move(temporary, file, true);
    }
}

internal static class FarmPaths
{
    internal static string Root { get; } = FindRoot();
    internal static string Artifacts => Path.Combine(Root, "artifacts");
    private static string FindRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        for (int i = 0; i < 10 && dir != null; i++, dir = dir.Parent)
            if (File.Exists(Path.Combine(dir.FullName, "GOAL.md")) || File.Exists(Path.Combine(dir.FullName, "farm-native.json"))) return dir.FullName;
        return AppContext.BaseDirectory;
    }
    internal static string Resource(string name)
    {
        using var s = typeof(FarmPaths).Assembly.GetManifestResourceStream(name) ?? throw new FileNotFoundException("Missing embedded QQ bridge: " + name);
        using var reader = new StreamReader(s); return reader.ReadToEnd();
    }
}
