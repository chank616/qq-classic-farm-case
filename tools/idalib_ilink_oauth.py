"""Headless idalib analysis of ilink2.dll: locate the OAuth-code CGI implementation.

Run with: .venv-ida/Scripts/python.exe tools/idalib_ilink_oauth.py [dll] [out]
"""

import sys

import idapro
import ida_auto
import ida_funcs
import idautils

TARGET = sys.argv[1] if len(sys.argv) > 1 else r"C:\Temp\ilinkre\ilink2.dll"
OUT = sys.argv[2] if len(sys.argv) > 2 else r"C:\Temp\ilinkre\ilink-oauth-decompile.txt"

TARGETS = [
    "GetOAuthCodeReq",
    "GetOAuthCodeResp",
    "TdiGetOAuthCodeAsync",
    "ilinkapp_getoauthcode",
    "TdiSendRequest",
    "kTdiKeyIlinkAppId",
    "kTdiKeyLoginScene",
    "kTdiKeyIlinkAppSessionType",
]

EXTRA = [0x1800DCDC0, 0x1800CC820, 0x1800CAEF0, 0x1800CD1C0, 0x180126430, 0x180202D00]


def main():
    ok = idapro.open_database(TARGET, True)
    print("open_database:", ok)
    ida_auto.auto_wait()

    fh = open(OUT, "w", encoding="utf-8")
    fh.write("image: %s\n" % TARGET)

    hits = {}
    for s in idautils.Strings():
        text = str(s)
        if text in TARGETS:
            hits.setdefault(text, []).append(s.ea)

    funcs = []
    for ea in EXTRA:
        if ea not in funcs:
            funcs.append(ea)
    for name in TARGETS:
        addrs = hits.get(name, [])
        fh.write("\n=== string %r (n=%d) ===\n" % (name, len(addrs)))
        for ea in addrs:
            fh.write("  at %s\n" % hex(ea))
            for x in idautils.XrefsTo(ea):
                fn = ida_funcs.get_func(x.frm)
                if fn:
                    fh.write("    xref %s -> %s (%s)\n" % (
                        hex(x.frm), hex(fn.start_ea), ida_funcs.get_func_name(fn.start_ea)))
                    if fn.start_ea not in funcs:
                        funcs.append(fn.start_ea)
                else:
                    fh.write("    xref %s -> (no function)\n" % hex(x.frm))

    for ea in funcs:
        fh.write("\n=== decompile %s (%s) ===\n" % (hex(ea), ida_funcs.get_func_name(ea)))
        try:
            import ida_hexrays
            cf = ida_hexrays.decompile(ea)
            fh.write(str(cf) if cf else "(no decompile)")
        except Exception as exc:  # noqa: BLE001
            fh.write("ERR %s" % exc)
        fh.write("\n")

    fh.write("\ntotal functions: %d\n" % len(funcs))
    fh.close()
    print("wrote", OUT, "functions:", len(funcs))
    idapro.close_database(False)


main()
