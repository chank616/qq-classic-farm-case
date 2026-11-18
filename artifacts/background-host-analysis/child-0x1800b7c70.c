__int64 __fastcall sub_1800B7C70(__int64 a1)
{
  __int64 v1; // rdi
  signed __int32 v2; // eax
  volatile signed __int32 *v3; // rbx
  signed __int32 v4; // ett
  __int64 v5; // rax
  __int64 result; // rax
  _BYTE v7[16]; // [rsp+20h] [rbp-138h] BYREF
  _BYTE v8[264]; // [rsp+30h] [rbp-128h] BYREF

  v1 = *(_QWORD *)(a1 + 64);
  if ( v1 )
  {
    v2 = *(_DWORD *)(v1 + 8);
    v3 = nullptr;
    while ( v2 )
    {
      v4 = v2;
      v2 = _InterlockedCompareExchange((volatile signed __int32 *)(v1 + 8), v2 + 1, v2);
      if ( v4 == v2 )
      {
        v5 = *(_QWORD *)(a1 + 56);
        v3 = *(volatile signed __int32 **)(a1 + 64);
        if ( !v5 )
          break;
        result = (*(__int64 (__fastcall **)(_QWORD))(*(_QWORD *)v5 + 8LL))(*(_QWORD *)(a1 + 56));
        goto LABEL_10;
      }
    }
  }
  else
  {
    v3 = nullptr;
  }
  result = sub_1800497D0(2);
  if ( (_BYTE)result )
  {
    sub_1800499D0(v7, "../../parent_child_ipc/core/parent_ipc_core/parent_ipc_receiver.cc", 77, 2);
    sub_18000105C(v8, "ParentIpcReceiverDelegate's(should be ParentIpcCore) is expired or assigned!");
    result = sub_18004A040(v7);
  }
LABEL_10:
  if ( v3 && !_InterlockedDecrement(v3 + 2) )
  {
    result = (**(__int64 (__fastcall ***)(volatile signed __int32 *))v3)(v3);
    if ( !_InterlockedDecrement(v3 + 3) )
      return (*(__int64 (__fastcall **)(volatile signed __int32 *))(*(_QWORD *)v3 + 8LL))(v3);
  }
  return result;
}
