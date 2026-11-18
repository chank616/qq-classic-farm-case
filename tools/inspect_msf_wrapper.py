import struct,json
from pathlib import Path
import pefile,capstone
p=pefile.PE(r'D:/Program Files/Tencent/QQNT/versions/9.9.35-52892/resources/app/wrapper.node',fast_load=True)
directory=p.OPTIONAL_HEADER.DATA_DIRECTORY[3];raw=p.get_data(directory.VirtualAddress,directory.Size)
target=0x10709c1;lo=0;hi=len(raw)//12
while lo<hi:
    mid=(lo+hi)//2;a,b,u=struct.unpack_from('<III',raw,mid*12)
    if target<a:hi=mid
    elif target>=b:lo=mid+1
    else:break
base=p.OPTIONAL_HEADER.ImageBase
md=capstone.Cs(capstone.CS_ARCH_X86,capstone.CS_MODE_64)
text='\n'.join(hex(x.address)+' '+x.mnemonic+' '+x.op_str for x in md.disasm(p.get_data(a,b-a),base+a))
Path('artifacts/background-host-analysis/sendMsfRequest-napi.asm').write_text(text)
print(json.dumps(dict(start=hex(base+a),end=hex(base+b),instructions=len(text.splitlines()))))
