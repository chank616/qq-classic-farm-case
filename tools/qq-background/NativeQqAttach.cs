using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

namespace FarmTray.Native;

internal static class NativeQqAttach
{
    private const uint Access = 0x0002 | 0x0008 | 0x0010 | 0x0020 | 0x0400 | 0x1000;
    internal static Process FindExistingQq()
    {
        foreach (var process in Process.GetProcessesByName("QQ").OrderBy(p => p.StartTime)) {
            nint handle = OpenProcess(0x1000, false, process.Id); if (handle == 0) continue;
            try {
                NtQueryInformationProcess(handle, 60, 0, 0, out uint size); if (size == 0 || size > 65536) continue;
                nint data = Marshal.AllocHGlobal((int)size);
                try {
                    if (NtQueryInformationProcess(handle, 60, data, size, out _) != 0) continue;
                    int length = (ushort)Marshal.ReadInt16(data); nint pointer = Marshal.ReadIntPtr(data, 8);
                    string command = Marshal.PtrToStringUni(pointer, length / 2) ?? "";
                    if (command.Contains("--type=") || command.Contains("--exApp=")) continue;
                    if (process.Modules.Cast<ProcessModule>().Any(m => m.ModuleName.Equals("QQNT.dll", StringComparison.OrdinalIgnoreCase))) return process;
                } finally { Marshal.FreeHGlobal(data); }
            } finally { CloseHandle(handle); }
        }
        throw new IOException("等待当前已登录的 QQ 会话");
    }
    internal static void Install(Process qq, string source, CancellationToken cancellation)
    {
        string dll = Path.Combine(AppContext.BaseDirectory, "QQFarmBridge.dll");
        if (!File.Exists(dll)) throw new IOException("缺少 QQ 会话桥接组件");
        using var hashStream = typeof(NativeQqAttach).Assembly.GetManifestResourceStream("QQFarmBridge.sha256")!;
        using var hashReader = new StreamReader(hashStream);
        string expected = hashReader.ReadToEnd().Trim();
        if (!Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(dll))).Equals(expected, StringComparison.OrdinalIgnoreCase)) throw new IOException("QQ 会话桥接组件校验失败");
        nint process = OpenProcess(Access, false, qq.Id); if (process == 0) throw new IOException("无法连接当前 QQ 进程");
        nint request = 0; bool requestRunning = false;
        try {
            var remote = qq.Modules.Cast<ProcessModule>().FirstOrDefault(m => m.ModuleName.Equals("QQFarmBridge.dll", StringComparison.OrdinalIgnoreCase));
            if (remote == null) {
                byte[] filename = Encoding.Unicode.GetBytes(dll + "\0");
                nint memory = VirtualAllocEx(process, 0, (nuint)filename.Length, 0x3000, 4); if (memory == 0) throw new IOException("QQ 桥接内存分配失败");
                bool loaderRunning = false;
                try {
                    Write(process, memory, filename);
                    nint localKernel = GetModuleHandleW("kernel32.dll");
                    nint localLoader = GetProcAddress(localKernel, "LoadLibraryW");
                    using var current = Process.GetCurrentProcess();
                    var owner = current.Modules.Cast<ProcessModule>().First(m => localLoader >= m.BaseAddress && localLoader < m.BaseAddress + m.ModuleMemorySize);
                    var remoteOwner = qq.Modules.Cast<ProcessModule>().First(m => m.ModuleName.Equals(owner.ModuleName, StringComparison.OrdinalIgnoreCase));
                    nint loader = remoteOwner.BaseAddress + (localLoader - owner.BaseAddress);
                    RunThread(process, loader, memory, 15000, ref loaderRunning);
                } finally { if (!loaderRunning) VirtualFreeEx(process, memory, 0, 0x8000); }
                qq.Refresh(); remote = qq.Modules.Cast<ProcessModule>().FirstOrDefault(m => m.ModuleName.Equals("QQFarmBridge.dll", StringComparison.OrdinalIgnoreCase));
                if (remote == null) throw new IOException("QQ 会话组件加载失败");
            }
            if (!Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(remote.FileName))).Equals(expected, StringComparison.OrdinalIgnoreCase)) throw new IOException("QQ 中存在其他版本的会话组件");
            nint local = NativeLibrary.Load(dll);
            nint entry;
            try { entry = remote.BaseAddress + (NativeLibrary.GetExport(local, "FarmBridgeInstall") - local); }
            finally { NativeLibrary.Free(local); }
            byte[] text = Encoding.UTF8.GetBytes(source), packet = new byte[8 + text.Length + 1];
            System.Buffers.Binary.BinaryPrimitives.WriteInt32LittleEndian(packet.AsSpan(4), text.Length); text.CopyTo(packet, 8);
            request = VirtualAllocEx(process, 0, (nuint)packet.Length, 0x3000, 4); if (request == 0) throw new IOException("QQ 桥接请求分配失败");
            Write(process, request, packet); Array.Clear(packet); Array.Clear(text);
            RunThread(process, entry, request, 45000, ref requestRunning);
            byte[] status = new byte[4];
            if (!ReadProcessMemory(process, request, status, 4, out _)) throw new IOException("QQ 桥接状态读取失败");
            if (BitConverter.ToInt32(status) != 2) throw new IOException("QQ 会话桥接未就绪（" + BitConverter.ToInt32(status) + "）");
        } finally { if (request != 0 && !requestRunning) VirtualFreeEx(process, request, 0, 0x8000); CloseHandle(process); }
    }
    private static void Write(nint process, nint address, byte[] bytes) { if (!WriteProcessMemory(process, address, bytes, (nuint)bytes.Length, out nuint count) || count != (nuint)bytes.Length) throw new IOException("QQ 桥接请求写入失败"); }
    private static void RunThread(nint process, nint function, nint data, uint wait, ref bool running)
    {
        nint thread = CreateRemoteThread(process, 0, 0, function, data, 0, out _); if (thread == 0) throw new IOException("QQ 会话连接失败");
        running = true;
        try { if (WaitForSingleObject(thread, wait) != 0) throw new IOException("QQ 会话连接超时"); running = false; }
        finally { CloseHandle(thread); }
    }
    [DllImport("kernel32", SetLastError = true)] private static extern nint OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32")] private static extern bool CloseHandle(nint handle);
    [DllImport("kernel32")] private static extern nint VirtualAllocEx(nint process, nint address, nuint size, uint type, uint protection);
    [DllImport("kernel32")] private static extern bool VirtualFreeEx(nint process, nint address, nuint size, uint type);
    [DllImport("kernel32")] private static extern bool WriteProcessMemory(nint process, nint address, byte[] bytes, nuint size, out nuint written);
    [DllImport("kernel32")] private static extern bool ReadProcessMemory(nint process, nint address, byte[] bytes, nuint size, out nuint read);
    [DllImport("kernel32", CharSet = CharSet.Unicode)] private static extern nint GetModuleHandleW(string name);
    [DllImport("kernel32", CharSet = CharSet.Ansi)] private static extern nint GetProcAddress(nint module, string name);
    [DllImport("kernel32")] private static extern nint CreateRemoteThread(nint process, nint attributes, nuint stack, nint function, nint data, uint flags, out uint threadId);
    [DllImport("kernel32")] private static extern uint WaitForSingleObject(nint handle, uint milliseconds);
    [DllImport("ntdll")] private static extern int NtQueryInformationProcess(nint process, int info, nint buffer, uint size, out uint needed);
}
