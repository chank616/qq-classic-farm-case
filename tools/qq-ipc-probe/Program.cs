using System.Runtime.InteropServices;
using System.Text.Json;
// QQ's existing child IPC component only. No farm host or page is launched.
string dll = args[0];
var module = NativeLibrary.Load(dll);
var getClass = Marshal.GetDelegateForFunctionPointer<GetClass>(NativeLibrary.GetExport(module,"DllGetClassObject"));
var clsid = new Guid("14d5685e-0574-4f1f-b6a4-9be9c3be0c0d");
var factoryId = new Guid("00000001-0000-0000-c000-000000000046");
var childId = new Guid("2a106583-a3c4-43af-85a0-57817489361a");
int factoryHr=getClass(ref clsid,ref factoryId,out var factory);
if(factoryHr!=0 || factory==IntPtr.Zero) throw new InvalidOperationException("Factory unavailable: "+factoryHr);
T Method<T>(IntPtr obj,int index) where T:Delegate => Marshal.GetDelegateForFunctionPointer<T>(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj),index*8));
int createHr=Method<Create>(factory,3)(factory,IntPtr.Zero,ref childId,out var child);
if(createHr!=0 || child==IntPtr.Zero) throw new InvalidOperationException("IPC unavailable: "+createHr);
var events=new System.Collections.Concurrent.ConcurrentQueue<object>();
Notify callback = (context,method,id,data,length)=> {
    // Payload can contain authentication material: deliberately never copy or log it.
    string name=Marshal.PtrToStringUTF8(method)??"";
    events.Enqueue(new {method=name,bytes=length});
};
Method<SetNotify>(child,5)(child,callback,IntPtr.Zero);
Method<Start>(child,3)(child);
await Task.Delay(5000);
var result=new {runtime="csharp-native-qq-ipc-probe",farmStarted=false,qqStarted=false,factoryHr,createHr,events=events.ToArray(),serverVerified=false,timestamp=DateTimeOffset.UtcNow};
File.WriteAllText("artifacts/qq-native-ipc-probe-result.json",JsonSerializer.Serialize(result,new JsonSerializerOptions{WriteIndented=true}));
Console.WriteLine(JsonSerializer.Serialize(result));
GC.KeepAlive(callback);
Environment.Exit(0);
[UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetClass(ref Guid clsid,ref Guid iid,out IntPtr instance);
[UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int Create(IntPtr self,IntPtr outer,ref Guid iid,out IntPtr instance);
[UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void SetNotify(IntPtr self,Notify callback,IntPtr context);
[UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void Start(IntPtr self);
[UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void Notify(IntPtr context,IntPtr method,long id,IntPtr data,uint length);
