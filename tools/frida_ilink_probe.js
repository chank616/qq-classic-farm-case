// Standalone ilink2.dll probe (route 2 feasibility).
//
// Proves the ILINK auth SDK loads and runs OUTSIDE QQ: it resolves the WeChat
// plugin copy of ilink2.dll (the one the mini-app host actually loads), calls the
// exported IlinkContext singleton and reads its config.
//
// Usage:
//   powershell -Command "Start-Process notepad.exe"
//   frida -p <notepad pid> -l tools/frida_ilink_probe.js -q
//
// Notes: Frida 17 removed Module.getExportByName (static) and Module.load needs
// the runtime dir on the DLL search path, otherwise ilink2.dll fails with 0x7E.

var B = String.fromCharCode(92);
var DIR = ['C:','Users','chank616','AppData','Roaming','Tencent','xwechat','xplugin',
           'plugins','RadiumWMPF','20089','extracted','runtime'].join(B);
var DLL = DIR + B + 'ilink2.dll';

var E_INSTANCE = '?Instance@IlinkContext@zidl_export@ilink@@SA?AV?$shared_ptr@VIlinkContext@zidl_export@ilink@@@std@@XZ';
var E_CONFIG   = '?Config@IlinkContext@zidl_export@ilink@@QEAA?AVIlinkStartConfig@pb_export@3@XZ';

function hex(p, n) {
  try { var b = new Uint8Array(p.readByteArray(n)); var s = '';
        for (var i = 0; i < b.length; i++) s += ('0' + b[i].toString(16)).slice(-2);
        return s; } catch (e) { return 'ERR'; }
}

new NativeFunction(Module.getGlobalExportByName('SetDllDirectoryW'), 'int', ['pointer'])
  (Memory.allocUtf16String(DIR));

var m = Module.load(DLL);
console.log('LOADED base=' + m.base + ' size=' + m.size + ' exports=' + m.enumerateExports().length);

var inst = m.getExportByName(E_INSTANCE);
var buf = Memory.alloc(32); buf.writeByteArray(new Array(32).fill(0));
new NativeFunction(inst, 'void', ['pointer'])(buf);          // shared_ptr is sret
var ctx = buf.readPointer();
console.log('IlinkContext::Instance() = ' + ctx + ' vtable=' + ctx.readPointer());

var cfg = Memory.alloc(192); cfg.writeByteArray(new Array(192).fill(0));
new NativeFunction(m.getExportByName(E_CONFIG), 'void', ['pointer', 'pointer'])(ctx, cfg);
console.log('Config() = ' + hex(cfg, 160));
