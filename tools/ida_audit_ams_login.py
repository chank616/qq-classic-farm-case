import json
import os
import re

import ida_auto
import ida_funcs
import ida_hexrays
import ida_name
import ida_nalt
import idautils
import idc

PATTERN = re.compile(r'GetLoginCode|GetLoginParams|LoginResult|OnBeginLogin|OnRequestLogin|OnWmpfLoginResult|OnLoginResult|GSCache|GetGameSession|wmpf_login|device_code|union_code|need_union_code|game session manager', re.I)
OUT = os.environ.get('QQFARM_IDA_OUT', os.path.abspath('artifacts/ams-login-ida.json'))

ida_auto.auto_wait()
try:
    ida_hexrays.init_hexrays_plugin()
except Exception:
    pass

rows = []
for item in idautils.Strings():
    value = str(item)
    if not PATTERN.search(value):
        continue
    refs = []
    for xref in idautils.XrefsTo(item.ea, 0):
        fn = ida_funcs.get_func(xref.frm)
        fn_start = fn.start_ea if fn else xref.frm
        name = ida_name.get_name(fn_start) or idc.get_func_name(fn_start)
        decomp = None
        if fn:
            try:
                decomp = str(ida_hexrays.decompile(fn_start))
            except Exception:
                decomp = None
        refs.append({
            'xrefEa': hex(xref.frm),
            'functionEa': hex(fn_start),
            'functionName': name,
            'decompilation': decomp,
        })
    rows.append({'stringEa': hex(item.ea), 'value': value, 'references': refs})

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump({'input': ida_nalt.get_input_file_path(), 'matchingStrings': rows}, f, ensure_ascii=False, indent=2)
print('AMS_LOGIN_AUDIT', OUT, 'strings=', len(rows), 'references=', sum(len(x['references']) for x in rows))
idc.qexit(0)
