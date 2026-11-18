__int64 __fastcall sub_18003F2A0(__int64 a1, int a2)
{
  int v2; // ebx
  _QWORD v5[2]; // [rsp+38h] [rbp-C0h] BYREF
  _QWORD v6[17]; // [rsp+48h] [rbp-B0h] BYREF

  v2 = a2;
  LOBYTE(a2) = -86;
  memset(v6, a2, sizeof(v6));
  sub_1800753E0((unsigned int)v6, 1455163304, 0, 0, 0, 0);
  v5[0] = v6;
  v5[1] = -1;
  sub_18003EA02(v5);
  *(_DWORD *)(sub_18003FB70(v5) + 8) = v2;
  v6[15] = "parent_child_ipc.mojom.ChildIpc";
  v6[16] = "SendInterfaceVersion";
  (*(void (__fastcall **)(_QWORD, _QWORD *))(**(_QWORD **)(a1 + 8) + 16LL))(*(_QWORD *)(a1 + 8), v6);
  return sub_180074C80(v6);
}
