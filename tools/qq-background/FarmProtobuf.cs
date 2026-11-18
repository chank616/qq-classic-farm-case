using System.Buffers.Binary;
using System.Text;
using System.Text.Json.Nodes;

namespace FarmTray.Native;

public static class FarmProtobuf
{
    private static readonly JsonObject Schemas = JsonNode.Parse(typeof(FarmProtobuf).Assembly.GetManifestResourceStream("farm-protocol.json")!)!.AsObject();
    private static JsonObject Schema(string name) => Schemas[name.Replace("gamepb.", "")] as JsonObject ?? throw new InvalidDataException("Missing offline protobuf: " + name);
    private static void Varint(Stream stream, ulong value) { while (value >= 128) { stream.WriteByte((byte)((value & 127) | 128)); value >>= 7; } stream.WriteByte((byte)value); }
    private static ulong Number(JsonNode node) => node.ToJsonString().Trim('"') == "true" ? 1UL : node.ToJsonString().Trim('"') == "false" ? 0UL : unchecked((ulong)long.Parse(node.ToString(), System.Globalization.CultureInfo.InvariantCulture));
    private static int Wire(string kind) => kind is "float" or "fixed32" ? 5 : kind is "double" or "fixed64" ? 1 : kind is "string" or "bytes" || kind.StartsWith("message:") ? 2 : 0;
    public static byte[] Encode(string name, JsonObject input)
    {
        using var stream = new MemoryStream();
        foreach (var field in Schema(name).OrderBy(field => field.Value![0]!.GetValue<int>())) {
            if (input[field.Key] is not JsonNode value) continue;
            int number = field.Value![0]!.GetValue<int>(); string kind = field.Value[1]!.GetValue<string>();
            if (kind.StartsWith("map:")) {
                var types = MapTypes(kind);
                foreach (var pair in value.AsObject()) if (pair.Value != null) {
                    using var entry = new MemoryStream(); Write(entry, 1, types.Key, JsonValue.Create(pair.Key)!); Write(entry, 2, types.Value, pair.Value);
                    Varint(stream, (ulong)((number << 3) | 2)); Varint(stream, (ulong)entry.Length); stream.Write(entry.ToArray());
                }
            }
            else if (kind.StartsWith("repeated:")) {
                var array = value.AsArray();
                bool packed = field.Value.AsArray().Count > 2 && field.Value[2]?.GetValue<bool>() == true;
                if (packed && array.Count > 0) {
                    using var entries = new MemoryStream(); foreach (var item in array) if (item != null) Varint(entries, Number(item));
                    Varint(stream, (ulong)((number << 3) | 2)); Varint(stream, (ulong)entries.Length); stream.Write(entries.ToArray());
                } else foreach (var item in array) if (item != null) Write(stream, number, kind[9..], item);
            }
            else Write(stream, number, kind, value);
        }
        return stream.ToArray();
    }
    private static void Write(Stream stream, int number, string kind, JsonNode value)
    {
        int wire = Wire(kind); Varint(stream, (ulong)((number << 3) | wire));
        if (wire == 0) { Varint(stream, Number(value)); return; }
        if (wire == 2) {
            byte[] bytes = kind == "string" ? Encoding.UTF8.GetBytes(value.GetValue<string>()) : kind == "bytes" ? Convert.FromBase64String(value.GetValue<string>()) : Encode(kind[8..], value.AsObject());
            Varint(stream, (ulong)bytes.Length); stream.Write(bytes); return;
        }
        Span<byte> data = stackalloc byte[8];
        if (wire == 5) { if (kind == "float") BinaryPrimitives.WriteSingleLittleEndian(data, value.GetValue<float>()); else BinaryPrimitives.WriteUInt32LittleEndian(data, (uint)Number(value)); stream.Write(data[..4]); }
        else { if (kind == "double") BinaryPrimitives.WriteDoubleLittleEndian(data, value.GetValue<double>()); else BinaryPrimitives.WriteUInt64LittleEndian(data, Number(value)); stream.Write(data); }
    }
    private static ulong ReadVarint(byte[] bytes, ref int at)
    {
        ulong result = 0; for (int shift = 0; shift < 70; shift += 7) { if (at >= bytes.Length) throw new InvalidDataException("Truncated protobuf varint"); byte value = bytes[at++]; result |= (ulong)(value & 127) << shift; if ((value & 128) == 0) return result; } throw new InvalidDataException("Oversized protobuf varint");
    }
    public static JsonObject Decode(string name, byte[] bytes)
    {
        var fields = Schema(name).ToDictionary(x => x.Value![0]!.GetValue<int>(), x => (Name: x.Key, Kind: x.Value![1]!.GetValue<string>()));
        var result = new JsonObject(); int at = 0;
        while (at < bytes.Length) {
            ulong tag = ReadVarint(bytes, ref at); int number = (int)(tag >> 3), wire = (int)(tag & 7);
            if (number <= 0) throw new InvalidDataException("Invalid protobuf tag");
            if (!fields.TryGetValue(number, out var field)) { Skip(bytes, ref at, wire); continue; }
            bool repeated = field.Kind.StartsWith("repeated:"); string kind = repeated ? field.Kind[9..] : field.Kind;
            if (kind.StartsWith("map:")) {
                if (wire != 2) throw new InvalidDataException("Invalid map wire");
                int size = checked((int)ReadVarint(bytes, ref at)); if (size > bytes.Length - at) throw new InvalidDataException("Truncated map");
                byte[] data = bytes.AsSpan(at, size).ToArray(); at += size;
                var types = MapTypes(kind); JsonNode? key = null, mapValue = null; int offset = 0;
                while (offset < data.Length) {
                    ulong entryTag = ReadVarint(data, ref offset); int tagNumber = (int)(entryTag >> 3), entryWire = (int)(entryTag & 7);
                    if (tagNumber is 1 or 2) {
                        string type = tagNumber == 1 ? types.Key : types.Value;
                        if (entryWire != Wire(type)) throw new InvalidDataException("Invalid map entry wire");
                        var entryValue = Read(data, ref offset, entryWire, type); if (tagNumber == 1) key = entryValue; else mapValue = entryValue;
                    } else Skip(data, ref offset, entryWire);
                }
                if (result[field.Name] is not JsonObject map) { map = new(); result[field.Name] = map; }
                map[key?.ToString() ?? (types.Key == "string" ? "" : "0")] = mapValue ?? (types.Value == "string" || types.Value == "bytes" ? JsonValue.Create("") : types.Value.StartsWith("message:") ? new JsonObject() : JsonValue.Create(0));
                continue;
            }
            if (repeated && wire == 2 && Wire(kind) == 0) {
                int n = checked((int)ReadVarint(bytes, ref at)); if (n > bytes.Length - at) throw new InvalidDataException("Truncated packed field"); int end = at + n;
                var array = result[field.Name] as JsonArray ?? new JsonArray(); result[field.Name] ??= array;
                while (at < end) array.Add(JsonValue.Create(unchecked((long)ReadVarint(bytes, ref at))));
                continue;
            }
            if (wire != Wire(kind)) throw new InvalidDataException("Offline schema wire mismatch: " + name + "." + field.Name);
            JsonNode value = Read(bytes, ref at, wire, kind);
            if (repeated) { if (result[field.Name] is not JsonArray array) { array = new(); result[field.Name] = array; } array.Add(value); }
            else result[field.Name] = value;
        }
        return result;
    }
    private static JsonNode Read(byte[] bytes, ref int at, int wire, string kind)
    {
        if (wire == 0) { ulong n = ReadVarint(bytes, ref at); return kind == "bool" ? JsonValue.Create(n != 0)! : JsonValue.Create(unchecked((long)n))!; }
        int size = wire == 2 ? checked((int)ReadVarint(bytes, ref at)) : wire == 5 ? 4 : 8;
        if (size > bytes.Length - at) throw new InvalidDataException("Truncated protobuf field");
        var span = bytes.AsSpan(at, size); at += size;
        if (wire == 2) return kind == "string" ? JsonValue.Create(Encoding.UTF8.GetString(span))! : kind == "bytes" ? JsonValue.Create(Convert.ToBase64String(span))! : Decode(kind[8..], span.ToArray());
        if (wire == 5) return kind == "float" ? JsonValue.Create(BinaryPrimitives.ReadSingleLittleEndian(span))! : JsonValue.Create(BinaryPrimitives.ReadUInt32LittleEndian(span))!;
        return kind == "double" ? JsonValue.Create(BinaryPrimitives.ReadDoubleLittleEndian(span))! : JsonValue.Create(BinaryPrimitives.ReadUInt64LittleEndian(span))!;
    }
    private static void Skip(byte[] bytes, ref int at, int wire)
    {
        if (wire == 0) { ReadVarint(bytes, ref at); return; }
        int n = wire == 2 ? checked((int)ReadVarint(bytes, ref at)) : wire == 1 ? 8 : wire == 5 ? 4 : throw new InvalidDataException("Unsupported protobuf wire");
        if (n > bytes.Length - at) throw new InvalidDataException("Truncated unknown protobuf field"); at += n;
    }
    private static (string Key, string Value) MapTypes(string kind) { int separator = kind.IndexOf(':', 4); return (kind[4..separator], kind[(separator + 1)..]); }
}
