using System.Security.Cryptography;
using System.Text;

namespace FarmTray.Native;

internal static class GateProtocol
{
    internal sealed record Frame(long Type, long Sequence, long Error, string Message, byte[] Body);
    private static void Varint(Stream output, ulong number)
    {
        while (number >= 128) { output.WriteByte((byte)((number & 127) | 128)); number >>= 7; }
        output.WriteByte((byte)number);
    }
    private static void Number(Stream output, int field, ulong number) { Varint(output, (ulong)(field << 3)); Varint(output, number); }
    private static void Bytes(Stream output, int field, byte[] value)
    {
        Varint(output, (ulong)((field << 3) | 2)); Varint(output, (ulong)value.Length); output.Write(value);
    }
    private static void Text(Stream output, int field, string value) => Bytes(output, field, Encoding.UTF8.GetBytes(value));
    internal static byte[] Encode(string service, string method, long sequence, byte[] body)
    {
        using var meta = new MemoryStream();
        Text(meta, 1, service); Text(meta, 2, method); Number(meta, 3, 1); Number(meta, 4, (ulong)sequence); Number(meta, 5, 0);
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var random = RandomNumberGenerator.GetBytes(RandomNumberGenerator.GetInt32(64, 128));
        string token = new(random.Select(b => alphabet[b & 63]).ToArray());
        using var frame = new MemoryStream(); Bytes(frame, 1, meta.ToArray()); Bytes(frame, 2, body); Text(frame, 3, token + "=");
        return frame.ToArray();
    }
    private static ulong ReadVarint(byte[] data, ref int offset)
    {
        ulong n = 0;
        for (int shift = 0; shift < 64 && offset < data.Length; shift += 7) {
            byte b = data[offset++]; n |= (ulong)(b & 127) << shift; if (b < 128) return n;
        }
        throw new InvalidDataException("Invalid protobuf varint");
    }
    private static IEnumerable<(int Field, ulong Number, byte[] Bytes)> Fields(byte[] data)
    {
        int offset = 0;
        while (offset < data.Length) {
            ulong tag = ReadVarint(data, ref offset); int wire = (int)(tag & 7), field = (int)(tag >> 3);
            if (field == 0) throw new InvalidDataException("Invalid protobuf field");
            if (wire == 0) yield return (field, ReadVarint(data, ref offset), Array.Empty<byte>());
            else if (wire == 2) {
                int length = checked((int)ReadVarint(data, ref offset));
                if (length > data.Length - offset) throw new InvalidDataException("Truncated protobuf field");
                var bytes = data.AsSpan(offset, length).ToArray(); offset += length; yield return (field, 0, bytes);
            } else if (wire == 1 || wire == 5) {
                offset += wire == 1 ? 8 : 4; if (offset > data.Length) throw new InvalidDataException("Truncated protobuf value");
            } else throw new InvalidDataException("Unsupported protobuf wire type");
        }
    }
    internal static Frame Decode(byte[] data)
    {
        byte[] meta = Array.Empty<byte>(), body = Array.Empty<byte>();
        foreach (var f in Fields(data)) { if (f.Field == 1) meta = f.Bytes ?? Array.Empty<byte>(); else if (f.Field == 2) body = f.Bytes ?? Array.Empty<byte>(); }
        long type = 0, seq = 0, error = 0; string message = "";
        foreach (var f in Fields(meta)) switch (f.Field) {
            case 3: type = (long)f.Number; break; case 4: seq = (long)f.Number; break;
            case 6: error = (long)f.Number; break; case 7: message = Encoding.UTF8.GetString(f.Bytes ?? Array.Empty<byte>()); break;
        }
        return new(type, seq, error, message, body);
    }
}
