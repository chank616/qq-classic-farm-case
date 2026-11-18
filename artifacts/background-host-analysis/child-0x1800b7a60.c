void __fastcall sub_1800B7A60(__int64 a1, unsigned int a2)
{
  __int64 v4; // rax
  __int64 v5; // rcx
  signed __int32 v6; // eax
  volatile signed __int32 *v7; // rsi
  signed __int32 v8; // ett
  __int64 v9; // rdi
  void *v10; // rcx
  void *v11; // rcx
  __int128 v12; // [rsp+20h] [rbp-158h] BYREF
  __int64 v13; // [rsp+30h] [rbp-148h]
  _QWORD v14[2]; // [rsp+38h] [rbp-140h] BYREF
  _OWORD v15[16]; // [rsp+48h] [rbp-130h] BYREF

  if ( (unsigned __int8)sub_1800497D0(0) )
  {
    sub_1800499D0(v14, "../../parent_child_ipc/core/parent_ipc_core/parent_ipc_receiver.cc", 52, 0);
    v4 = sub_18000105C(v15, "Receive Hello from remote, remote version: ");
    sub_180006136(v4, a2);
    sub_18004A040(v14);
  }
  v5 = *(_QWORD *)(a1 + 64);
  if ( !v5 )
  {
    v7 = nullptr;
LABEL_19:
    if ( (unsigned __int8)sub_1800497D0(2) )
    {
      sub_1800499D0(v14, "../../parent_child_ipc/core/parent_ipc_core/parent_ipc_receiver.cc", 65, 2);
      sub_18000105C(v15, "ParentIpcReceiverDelegate's(should be ParentIpcCore) is expired or assigned!");
      sub_18004A040(v14);
    }
    goto LABEL_21;
  }
  v6 = *(_DWORD *)(v5 + 8);
  v7 = nullptr;
  do
  {
    if ( !v6 )
      goto LABEL_19;
    v8 = v6;
    v6 = _InterlockedCompareExchange((volatile signed __int32 *)(v5 + 8), v6 + 1, v6);
  }
  while ( v8 != v6 );
  v9 = *(_QWORD *)(a1 + 56);
  v7 = *(volatile signed __int32 **)(a1 + 64);
  if ( !v9 )
    goto LABEL_19;
  (*(void (__fastcall **)(__int64, _QWORD))(*(_QWORD *)v9 + 24LL))(v9, a2);
  v12 = 0;
  v13 = 0;
  v15[0] = xmmword_180152DE0;
  strcpy((char *)v14, "IPC_CONNECTED");
  (*(void (__fastcall **)(__int64, _QWORD *, _QWORD, __int128 *))(*(_QWORD *)v9 + 8LL))(v9, v14, 0, &v12);
  if ( *((_QWORD *)&v15[0] + 1) >= 0x10u )
  {
    v10 = (void *)v14[0];
    if ( (unsigned __int64)(*((_QWORD *)&v15[0] + 1) + 1LL) >= 0x1000 )
    {
      if ( (unsigned __int64)(v14[0] - 8LL - *(_QWORD *)(v14[0] - 8LL)) >= 0x20 )
        goto LABEL_26;
      v10 = *(void **)(v14[0] - 8LL);
    }
    j_j_free_0(v10);
  }
  v11 = (void *)v12;
  if ( (_QWORD)v12 )
  {
    if ( (unsigned __int64)(v13 - v12) < 0x1000 )
    {
LABEL_17:
      j_j_free_0(v11);
      goto LABEL_21;
    }
    if ( (unsigned __int64)(v12 - 8 - *(_QWORD *)(v12 - 8)) < 0x20 )
    {
      v11 = *(void **)(v12 - 8);
      goto LABEL_17;
    }
LABEL_26:
    invalid_parameter_noinfo_noreturn();
  }
LABEL_21:
  if ( v7 && !_InterlockedDecrement(v7 + 2) )
  {
    (**(void (__fastcall ***)(volatile signed __int32 *))v7)(v7);
    if ( !_InterlockedDecrement(v7 + 3) )
      (*(void (__fastcall **)(volatile signed __int32 *))(*(_QWORD *)v7 + 8LL))(v7);
  }
}
