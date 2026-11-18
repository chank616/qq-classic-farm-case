"""Targeted linear-sweep disassembly using IDA's decoder (no auto-analysis).

Run: .venv-ida/Scripts/python.exe tools/idalib_disasm_at.py <pe> <hexva> [count]
"""

import sys

import idapro
import idc

TARGET = sys.argv[1]
VA = int(sys.argv[2], 16)
COUNT = int(sys.argv[3]) if len(sys.argv) > 3 else 40


def main():
    ok = idapro.open_database(TARGET, False)
    print("open_database:", ok)
    ea = VA
    for _ in range(COUNT):
        n = idc.create_insn(ea)
        if n <= 0:
            print("%x: <cannot decode>" % ea)
            break
        print("%x: %s" % (ea, idc.GetDisasm(ea)))
        ea += n
    idapro.close_database(False)


main()
