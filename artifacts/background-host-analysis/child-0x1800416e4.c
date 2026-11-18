__int64 sub_1800416E4()
{
  __int64 v0; // rcx
  __int64 v1; // rdx
  __int64 v2; // r8
  _QWORD v4[3]; // [rsp+28h] [rbp-20h] BYREF

  sub_1800499C0(sub_1800428C0);
  sub_180049910("parentipc");
  LOBYTE(v0) = 1;
  LOBYTE(v1) = 1;
  LOBYTE(v2) = 1;
  sub_1800498F0(v0, v1, v2, 0);
  sub_1800497B0(0);
  v4[0] = 0xAAAAAAAA00000000uLL;
  v4[1] = 0;
  v4[2] = 0x100000000LL;
  return sub_1800490A0(v4);
}
