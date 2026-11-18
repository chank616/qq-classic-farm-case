__int64 __fastcall sub_1800B7800(__int64 a1)
{
  __int64 v1; // rdx
  signed __int32 v2; // eax
  volatile signed __int32 *v3; // rsi
  signed __int32 v4; // ett
  __int64 v5; // rdi
  char *v6; // rax
  void *v7; // rcx
  void *v8; // rcx
  __int64 result; // rax
  __int128 v10; // [rsp+20h] [rbp-158h] BYREF
  __int64 v11; // [rsp+30h] [rbp-148h]
  _QWORD v12[2]; // [rsp+38h] [rbp-140h] BYREF
  __int128 v13; // [rsp+48h] [rbp-130h] BYREF

  v1 = *(_QWORD *)(a1 + 64);
  if ( v1 )
  {
    v2 = *(_DWORD *)(v1 + 8);
    v3 = nullptr;
    do
    {
      if ( !v2 )
        goto LABEL_18;
      v4 = v2;
      v2 = _InterlockedCompareExchange((volatile signed __int32 *)(v1 + 8), v2 + 1, v2);
    }
    while ( v4 != v2 );
    v5 = *(_QWORD *)(a1 + 56);
    v3 = *(volatile signed __int32 **)(a1 + 64);
    if ( v5 )
    {
      v10 = 0;
      v11 = 0;
      v6 = (char *)operator new(0x20u);
      v13 = xmmword_180152DA0;
      strcpy(v6, "IPC_DISCONNECTED");
      v12[0] = v6;
      (*(void (__fastcall **)(__int64, _QWORD *, _QWORD, __int128 *))(*(_QWORD *)v5 + 8LL))(v5, v12, 0, &v10);
      if ( *((_QWORD *)&v13 + 1) >= 0x10u )
      {
        v7 = (void *)v12[0];
        if ( (unsigned __int64)(*((_QWORD *)&v13 + 1) + 1LL) >= 0x1000 )
        {
          if ( (unsigned __int64)(v12[0] - 8LL - *(_QWORD *)(v12[0] - 8LL)) >= 0x20 )
            goto LABEL_25;
          v7 = *(void **)(v12[0] - 8LL);
        }
        j_j_free_0(v7);
      }
      v8 = (void *)v10;
      if ( !(_QWORD)v10 )
      {
LABEL_16:
        result = (*(__int64 (__fastcall **)(__int64))(*(_QWORD *)v5 + 16LL))(v5);
        goto LABEL_20;
      }
      if ( (unsigned __int64)(v11 - v10) < 0x1000 )
      {
LABEL_15:
        j_j_free_0(v8);
        goto LABEL_16;
      }
      if ( (unsigned __int64)(v10 - 8 - *(_QWORD *)(v10 - 8)) < 0x20 )
      {
        v8 = *(void **)(v10 - 8);
        goto LABEL_15;
      }
LABEL_25:
      invalid_parameter_noinfo_noreturn();
    }
  }
  else
  {
    v3 = nullptr;
  }
LABEL_18:
  result = sub_1800497D0(2);
  if ( (_BYTE)result )
  {
    sub_1800499D0(v12, "../../parent_child_ipc/core/parent_ipc_core/parent_ipc_receiver.cc", 46, 2);
    sub_18000105C(&v13, "ParentIpcReceiverDelegate's(should be ParentIpcCore) is expired or assigned!");
    result = sub_18004A040(v12);
  }
LABEL_20:
  if ( v3 && !_InterlockedDecrement(v3 + 2) )
  {
    result = (**(__int64 (__fastcall ***)(volatile signed __int32 *))v3)(v3);
    if ( !_InterlockedDecrement(v3 + 3) )
      return (*(__int64 (__fastcall **)(volatile signed __int32 *))(*(_QWORD *)v3 + 8LL))(v3);
  }
  return result;
}
