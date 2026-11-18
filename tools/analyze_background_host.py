"""Static analysis of executable code only; never reads account databases."""
import json, os, re, shutil, sys
from pathlib import Path
import idapro
import ida_auto, ida_funcs, ida_hexrays, ida_name, idautils, idc

source = Path(sys.argv[1])
target = Path('artifacts/background-host-analysis') / source.name
target.parent.mkdir(parents=True, exist_ok=True)
if not target.exists(): shutil.copyfile(source, target)
rc = idapro.open_database(str(target.resolve()), True)
if rc != 0: raise RuntimeError('IDA open failed: ' + str(rc))
ida_auto.auto_wait()
ida_hexrays.init_hexrays_plugin()
pattern = re.compile(r'QQMain|InitIPC4Win|ipc get token|ipc onRecvToken|session begin init|IPC_CONNH|parentipc|childipc|ELECTRON_RUN_AS_NODE|load from curVersion|config_current_version', re.I)
found, done = [], set()
for item in idautils.Strings():
    text = str(item)
    if not pattern.search(text): continue
    refs = []
    for ref in idautils.XrefsTo(item.ea, 0):
        fn = ida_funcs.get_func(ref.frm)
        if not fn or fn.start_ea in done: continue
        done.add(fn.start_ea)
        try: code = str(ida_hexrays.decompile(fn.start_ea))
        except Exception as exc: code = str(exc)
        refs.append(dict(address=hex(fn.start_ea),name=ida_name.get_name(fn.start_ea),code=code))
    found.append(dict(text=text,refs=refs))
out = target.with_suffix(target.suffix+'.analysis.json')
out.write_text(json.dumps(found,ensure_ascii=False,indent=2),encoding='utf8')
idapro.close_database(True)
print(json.dumps(dict(output=str(out),matches=len(found),functions=len(done))),flush=True)
