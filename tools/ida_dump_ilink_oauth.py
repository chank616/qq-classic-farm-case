import ida_auto
import ida_bytes
import ida_funcs
import ida_hexrays
import ida_lines
import idautils
import idc

OUT = r"E:\workspace\QQ经典农场案例\artifacts\ilink-oauth-decompile.txt"

TARGETS = [
    "GetOAuthCodeReq",
    "GetOAuthCodeResp",
    "TdiGetOAuthCodeAsync",
    "ilinkapp_getoauthcode",
    "TdiSendRequest",
]


def main():
    ida_auto.auto_wait()
    f = open(OUT, "w", encoding="utf-8")

    string_hits = {}
    for s in idautils.Strings():
        text = str(s)
        if text in TARGETS:
            string_hits.setdefault(text, []).append(s.ea)

    funcs = set()
    for name, addrs in string_hits.items():
        f.write("=== string %r ===\n" % name)
        for ea in addrs:
            f.write("  at %s\n" % hex(ea))
            for x in idautils.XrefsTo(ea):
                fn = ida_funcs.get_func(x.frm)
                if fn:
                    f.write("    xref %s -> func %s (%s)\n"
                            % (hex(x.frm), hex(fn.start_ea), ida_funcs.get_func_name(fn.start_ea)))
                    funcs.add(fn.start_ea)
                else:
                    f.write("    xref %s -> (no function)\n" % hex(x.frm))

    for ea in sorted(funcs):
        f.write("\n=== decompile %s (%s) ===\n" % (hex(ea), ida_funcs.get_func_name(ea)))
        try:
            cf = ida_hexrays.decompile(ea)
            text = str(cf) if cf else "(no decompile)"
        except Exception as exc:  # noqa: BLE001
            text = "ERR %s" % exc
        f.write(text)
        f.write("\n")

    f.write("\ntotal functions: %d\n" % len(funcs))
    f.close()
    idc.qexit(0)


main()
