__int64 __fastcall sub_1800B8740(int a1, int a2, __int64 a3)
{
  _QWORD *v6; // rax
  int v8; // [rsp+40h] [rbp-38h]
  _QWORD *v9; // [rsp+48h] [rbp-30h] BYREF
  __int64 v10; // [rsp+50h] [rbp-28h] BYREF

  v10 = a3;
  v6 = operator new(8u);
  *v6 = &off_1801677D0;
  v9 = v6;
  if ( a3 )
    sub_1800157D0(a3 + 8);
  v8 = 0;
  sub_1800ECF58(a1, a2, a3, (unsigned int)"parent_child_ipc.mojom.ParentIpc", (__int64)&v9, 0, 0, a1 + 32, v8);
  return sub_1800423BE(&v10);
}
