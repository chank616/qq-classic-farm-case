using System.Security.Cryptography;
using System.Text.Json;
using FarmTray.Native;
using System.Text.Json.Nodes;

if (args.Length == 2 && args[0] == "--codec-test") {
    var fixtures = JsonNode.Parse(File.ReadAllText(args[1]))!.AsArray();
    int checkedCount = 0;
    bool Same(JsonNode? a, JsonNode? b) {
        if (a is JsonObject x && b is JsonObject y) return x.Count == y.Count && x.All(p => y.ContainsKey(p.Key) && Same(p.Value, y[p.Key]));
        if (a is JsonArray xa && b is JsonArray ya) return xa.Count == ya.Count && xa.Select((v, i) => Same(v, ya[i])).All(v => v);
        return a?.ToString() == b?.ToString();
    }
    foreach (var fixture in fixtures) {
        string name = fixture!["name"]!.GetValue<string>();
        byte[] expected = Convert.FromBase64String(fixture["wire"]!.GetValue<string>());
        byte[] encoded = FarmProtobuf.Encode(name, fixture["input"]!.AsObject());
        if (!encoded.SequenceEqual(expected)) {
            int offset = Enumerable.Range(0, Math.Min(encoded.Length, expected.Length)).FirstOrDefault(i => encoded[i] != expected[i]);
            throw new InvalidDataException("Generated-factory encoding mismatch: " + name + " offset=" + offset + " sizes=" + encoded.Length + "/" + expected.Length + " actual=" + Convert.ToHexString(encoded.AsSpan(Math.Max(0, offset-6), Math.Min(30, encoded.Length-Math.Max(0, offset-6)))) + " expected=" + Convert.ToHexString(expected.AsSpan(Math.Max(0, offset-6), Math.Min(30, expected.Length-Math.Max(0, offset-6)))));
        }
        var decoded = FarmProtobuf.Decode(name, expected);
        if (!Same(decoded, fixture["expected"])) throw new InvalidDataException("Generated-factory decoding mismatch: " + name + "\nActual: " + decoded + "\nExpected: " + fixture["expected"]);
        checkedCount++;
    }
    Console.WriteLine("Independent generated-factory protobuf fixtures passed: " + checkedCount);
    File.WriteAllText("artifacts/codec-check/result.json", new JsonObject { ["passed"] = true, ["fixtures"] = checkedCount, ["source"] = "cached game generated protobuf factories", ["syntheticData"] = true }.ToJsonString());
    return;
}

if(args.Length!=1)throw new ArgumentException("Pass cached tsdk.wasm path");
using var runtime=new OfflineTsdk(args[0]);
byte[][] inputs = [[8,2],RandomNumberGenerator.GetBytes(512),new byte[4096]];
foreach (var input in inputs) {
    var encrypted = runtime.Encrypt(input);
    if (!runtime.Decrypt(encrypted).SequenceEqual(input)) throw new InvalidDataException("TSDK roundtrip failed");
    if (encrypted.SequenceEqual(input)) throw new InvalidDataException("Encryption left payload unchanged");
}
var result = new { runtime = "csharp-wasmtime", farmStarted = false, qqStarted = false, cases = inputs.Length, roundtrip = true, serverVerified = false, timestamp = DateTimeOffset.UtcNow };
Directory.CreateDirectory("artifacts");
File.WriteAllText("artifacts/standalone-csharp-tsdk-result.json",JsonSerializer.Serialize(result,new JsonSerializerOptions{WriteIndented=true}));
Console.WriteLine(JsonSerializer.Serialize(result));
