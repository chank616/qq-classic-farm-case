__int64 __fastcall sub_18003F370(__int64 a1, void *a2, __int64 a3, __int64 a4)
{
  void *v6; // r14
  __int64 v8; // rdi
  __int64 v9; // rsi
  __int64 v10; // rax
  __int64 v11; // rax
  __int64 v12; // rax
  __int64 v13; // rax
  __int64 v14; // rsi
  __int64 v15; // rdx
  __int64 v16; // rsi
  __int64 v17; // rax
  __int64 v18; // rax
  __int64 v19; // rax
  __int64 v20; // rax
  unsigned __int64 v22; // [rsp+30h] [rbp-238h] BYREF
  __int128 v23; // [rsp+38h] [rbp-230h]
  __int64 v24; // [rsp+48h] [rbp-220h]
  __int64 v25; // [rsp+50h] [rbp-218h] BYREF
  __int64 v26; // [rsp+58h] [rbp-210h]
  __int64 v27; // [rsp+60h] [rbp-208h]
  __int64 v28; // [rsp+68h] [rbp-200h]
  _QWORD v29[2]; // [rsp+70h] [rbp-1F8h] BYREF
  _QWORD v30[17]; // [rsp+80h] [rbp-1E8h] BYREF
  _BYTE v31[16]; // [rsp+108h] [rbp-160h] BYREF
  _BYTE v32[264]; // [rsp+118h] [rbp-150h] BYREF

  v6 = a2;
  LOBYTE(a2) = -86;
  memset(v30, (int)a2, sizeof(v30));
  sub_1800753E0((unsigned int)v30, 649179546, 0, 0, 0, 0);
  v29[0] = v30;
  v29[1] = -1;
  sub_18003ED74(v29);
  v27 = v29[0];
  v28 = -1;
  sub_18003FCD2(v6);
  v8 = sub_18003FB70(v29) + 8;
  sub_18003EDA6(v8, 0);
  if ( (unsigned __int8)sub_1800497D0(3) && !*(_QWORD *)(sub_18003FB70(v29) + 8) && !(unsigned __int8)sub_180078B40(8) )
  {
    sub_1800499D0(v31, "gen/parent_child_ipc/core/mojom/ipc.mojom.cc", 365, 3);
    v9 = sub_18000105C(v32, "The outgoing message will trigger ");
    v10 = sub_180078300(8);
    v11 = sub_18000105C(v9, v10);
    v12 = sub_18000105C(v11, " at the receiving side (");
    v13 = sub_18000105C(v12, "null method_name in ChildIpc.SendMessageUsingBuffer request");
    sub_18000105C(v13, ").");
    sub_18004A040(v31);
  }
  *(_QWORD *)(sub_18003FB70(v29) + 16) = a3;
  v25 = v29[0];
  v26 = -1;
  v22 = 0xAAAAAA0000000000uLL;
  v23 = 0;
  v24 = 0;
  sub_18003FEF4(a4, &v25, &v22);
  v14 = sub_18003FB70(v29) + 24;
  if ( v26 == -1 )
    v15 = 0;
  else
    v15 = sub_18003EE1A(&v25);
  sub_18003EDA6(v14, v15);
  if ( (unsigned __int8)sub_1800497D0(3) && !*(_QWORD *)(sub_18003FB70(v29) + 24) && !(unsigned __int8)sub_180078B40(8) )
  {
    sub_1800499D0(v31, "gen/parent_child_ipc/core/mojom/ipc.mojom.cc", 379, 3);
    v16 = sub_18000105C(v32, "The outgoing message will trigger ");
    v17 = sub_180078300(8);
    v18 = sub_18000105C(v16, v17);
    v19 = sub_18000105C(v18, " at the receiving side (");
    v20 = sub_18000105C(v19, "null data in ChildIpc.SendMessageUsingBuffer request");
    sub_18000105C(v20, ").");
    sub_18004A040(v31);
  }
  v30[15] = "parent_child_ipc.mojom.ChildIpc";
  v30[16] = "SendMessageUsingBuffer";
  (*(void (__fastcall **)(_QWORD, _QWORD *))(**(_QWORD **)(a1 + 8) + 16LL))(*(_QWORD *)(a1 + 8), v30);
  sub_18003EE98(&v22);
  return sub_180074C80(v30);
}
