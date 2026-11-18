"""Full auto-analysis of wrapper.node, then decompile the SetDBKey function.

Run in background: .venv-ida/Scripts/python.exe tools/idalib_wrapper_setdbkey.py
"""

import idapro
import ida_auto
import ida_funcs

TARGET = r"C:\Temp\ilinkre\wrapper.dll"
OUT = r"C:\Temp\ilinkre\setdbkey.txt"
REFS = [0x182BCD4B3, 0x182BCD8F1]


def main():
    ok = idapro.open_database(TARGET, True)
    print("open_database:", ok, flush=True)
    ida_auto.auto_wait()
    print("auto-analysis done", flush=True)

    out = open(OUT, "w", encoding="utf-8")
    for ea in REFS:
        fn = ida_funcs.get_func(ea)
        out.write("ref %x -> func %s\n" % (ea, hex(fn.start_ea) if fn else "None"))
        if not fn:
            continue
        try:
            import ida_hexrays
            cf = ida_hexrays.decompile(fn.start_ea)
            out.write(str(cf) if cf else "(no decompile)")
        except Exception as exc:  # noqa: BLE001
            out.write("ERR %s" % exc)
        out.write("\n\n")
    out.close()
    print("written", OUT, flush=True)
    idapro.close_database(False)


main()
