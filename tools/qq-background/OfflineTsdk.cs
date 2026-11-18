using System.Buffers.Binary;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using Wasmtime;

namespace FarmTray.Native;

public sealed class OfflineTsdk : IDisposable
{
 private readonly Engine _engine;
 private readonly Store _store;
 private readonly Module _module;
 private readonly Linker _linker;
 private readonly Instance _instance;
 private Memory? _memory;
 private readonly Func<int,int> _alloc;
 private readonly Action<int> _free;
 private readonly object _gate = new();
 private bool _disposed;
 public OfflineTsdk(string wasmPath)
 {
  var wasm = File.ReadAllBytes(wasmPath);
  const string expected = "837BD271557DC9A21D5CD28B66076EA012EB39A4F4CBE298F529716469C087FC";
  if (Convert.ToHexString(SHA256.HashData(wasm)) != expected) throw new InvalidDataException("Unsupported TSDK version");
  _engine = new Engine();
  _store = new Store(_engine);
  _module = Module.FromBytes(_engine, "cached-tsdk", wasm);
  _linker = new Linker(_engine);
  
  int WriteText(string value, int ptr, int capacity) {
      var bytes = Encoding.UTF8.GetBytes(value);
      if (ptr == 0 || capacity <= bytes.Length) return 0;
      bytes.CopyTo(_memory!.GetSpan(ptr, bytes.Length)); _memory.GetSpan(ptr + bytes.Length, 1)[0] = 0;
      return ptr;
  }
  void Define(string name, Function callback) => _linker.Define("a", name, callback);
  Define("a", Function.FromCallback(_store, (int expr, int file, int line, int fn) => throw new InvalidDataException("TSDK assertion at line " + line)));
  Define("b", Function.FromCallback(_store, (int file, int data, int encoding) => 0));
  Define("c", Function.FromCallback(_store, (int ptr, int capacity) => WriteText(Environment.StackTrace, ptr, capacity) == 0 ? 0 : Encoding.UTF8.GetByteCount(Environment.StackTrace) + 1));
  Define("d", Function.FromCallback(_store, (int ptr, int capacity) => WriteText("v3.9.0.1792070537", ptr, capacity)));
  Define("e", Function.FromCallback(_store, (int request) => 0));
  Define("f", Function.FromCallback(_store, () => { }));
  Define("g", Function.FromCallback(_store, (int file, int output, int capacity, int encoding) => 0));
  var clock = Stopwatch.StartNew();
  Define("h", Function.FromCallback(_store, (int id, int low, int high, int output) => {
      if (id < 0 || id > 3) return 28;
      ulong ns = id == 0 ? (ulong)DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() * 1000000UL : (ulong)(clock.Elapsed.TotalMilliseconds * 1000000);
      BinaryPrimitives.WriteUInt64LittleEndian(_memory!.GetSpan(output, 8), ns); return 0;
  }));
  Define("i", Function.FromCallback(_store, (int ptr, int capacity) => WriteText(Path.GetFullPath("artifacts/standalone-csharp-probe") + Path.DirectorySeparatorChar, ptr, capacity)));
  Define("j", Function.FromCallback(_store, (int ptr, int capacity) => WriteText("Windows;win32;" + Environment.OSVersion.VersionString + ";.NET;", ptr, capacity)));
  byte[] table = [93,86,110,34,65,129,8,113,53,192,121,32,86,162,255,139,217,70,223,0,45,176,85,103,234,116,120,194,206,7,176,222,56,6,161,159,154,231,93,229,39,107,197,136,167,52,155,228,209,117,218,8,107,241,32,62,53,200,238];
  Define("k", Function.FromCallback(_store, (int ptr, int capacity) => {
      if (ptr == 0 || capacity < table.Length) return 0;
      table.CopyTo(_memory!.GetSpan(ptr, table.Length)); return table.Length;
  }));
  Define("l", Function.FromCallback(_store, () => Debugger.IsAttached ? 1 : 0));
  Define("m", Function.FromCallback(_store, (int ptr, int capacity) => WriteText("1112386029", ptr, capacity)));
  Define("n", Function.FromCallback(_store, (int ptr, int capacity) => WriteText("1112386029", ptr, capacity)));
  Define("o", Function.FromCallback(_store, (int a, int b, int c, int d) => { }));
  Define("p", Function.FromCallback(_store, (int file) => 0));
  Define("q", Function.FromCallback(_store, (int ptr) => { BinaryPrimitives.WriteInt32LittleEndian(_memory!.GetSpan(ptr,4), (int)DateTimeOffset.UtcNow.ToUnixTimeSeconds()); return 1; }));
  Define("r", Function.FromCallback(_store, new Func<int,int>(bytes => throw new OutOfMemoryException("TSDK _memory growth failed"))));
  Define("s", Function.FromCallback(_store, () => (double)DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()));
  Define("t", Function.FromCallback(_store, (int file, int data, int encoding) => 0));
  Define("u", Function.FromCallback(_store, () => throw new InvalidDataException("TSDK aborted")));
  Define("v", Function.FromCallback(_store, (int ptr, int length) => 0));
  _instance = _linker.Instantiate(_store, _module);
  _memory = _instance.GetMemory("w")!;
  var decryptSection = _instance.GetAction<int,int,int>("__mergewasm_shared____wasm_decrypt_strings")!;
  (int ptr,int length)[] segments = [(1024,5541),(6580,8989),(15585,33),(15643,1),(15655,21),(15701,1),(15713,21),(15759,1),(15771,30),(15826,14),(15875,1),(15887,21),(15933,1),(15945,671),(16632,400),(17040,103),(67371008,404)];
  foreach (var segment in segments) decryptSection(segment.ptr,segment.length,1871261153);
  _instance.GetAction("x")!();
  _alloc = _instance.GetFunction<int,int>("A")!;
  _free = _instance.GetAction<int>("B")!;
  int key = _alloc(2);
  try { WriteText("0",key,2); _instance.GetAction<int,int>("G")!(3167,key); } finally { _free(key); }
  
 }
 public byte[] Encrypt(byte[] data) => Transform(data,"ba");
 public byte[] Decrypt(byte[] data) => Transform(data,"ca");
 private byte[] Transform(byte[] data,string export)
 {
  lock(_gate) {
   ObjectDisposedException.ThrowIf(_disposed,this);
   if(data.Length==0)return [];
   int ptr=_alloc(data.Length+1);
   if(ptr==0)throw new OutOfMemoryException("TSDK allocation failed");
   try { data.CopyTo(_memory!.GetSpan(ptr,data.Length));_instance.GetAction<int,int>(export)!(ptr,data.Length);return _memory.GetSpan(ptr,data.Length).ToArray(); }
   finally { _memory!.GetSpan(ptr,data.Length+1).Clear();_free(ptr); }
  }
 }
 public void Dispose() { lock(_gate) { if(_disposed)return;_disposed=true;_linker.Dispose();_module.Dispose();_store.Dispose();_engine.Dispose(); } }
}
