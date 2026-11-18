import json, shutil, sys
from pathlib import Path
import idapro
import ida_auto, ida_bytes, ida_funcs, ida_hexrays, ida_name, idautils, idc
source=Path(sys.argv[1]); target=Path('artifacts/background-host-analysis')/source.name
if not target.exists(): shutil.copyfile(source,target)
rc=idapro.open_database(str(target.resolve()),False)
if rc: raise RuntimeError(str(rc))
ida_hexrays.init_hexrays_plugin()
result=[]
targets=[]
for arg in sys.argv[2:]:
    if arg.startswith('xref:'):
        for ref in idautils.XrefsTo(int(arg[5:],16),0):
            fn=ida_funcs.get_func(ref.frm)
            if fn: targets.append(hex(fn.start_ea))
    else: targets.append(arg)
for name in dict.fromkeys(targets):
    ea=int(name,16) if name.startswith('0x') else ida_name.get_name_ea(idc.BADADDR,name)
    if ea==idc.BADADDR: result.append(dict(name=name,error='name not found'));continue
    if not ida_funcs.get_func(ea):
        idc.create_insn(ea); ida_funcs.add_func(ea)
    try: code=str(ida_hexrays.decompile(ea))
    except Exception as exc: code=str(exc)
    result.append(dict(name=name,address=hex(ea),code=code))
out=target.with_suffix(target.suffix+'.selected.json');out.write_text(json.dumps(result,indent=2),encoding='utf8')
idapro.close_database(True)
print(json.dumps(dict(output=str(out),count=len(result))),flush=True)
