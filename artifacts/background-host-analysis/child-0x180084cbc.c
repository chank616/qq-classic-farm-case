void __fastcall sub_180084CBC(_QWORD *a1)
{
  void *v2; // rdi
  __int64 v3; // rdi
  void *v4; // rbx
  void (__fastcall ***v5)(_QWORD, __int64); // rcx
  void *v6; // [rsp+38h] [rbp-30h] BYREF
  _BYTE v7[8]; // [rsp+40h] [rbp-28h] BYREF

  if ( a1[5] )
  {
    if ( !*a1 )
    {
      sub_1800435B0(v7, "../..\\mojo/public/cpp/bindings/lib/interface_ptr_state.h", 244, "router()");
      sub_180043630(v7);
      sub_180043640(v7);
    }
    if ( !a1[1] )
    {
      sub_1800435B0(v7, "../..\\mojo/public/cpp/bindings/lib/interface_ptr_state.h", 245, "endpoint_client()");
      sub_180043630(v7);
      sub_180043640(v7);
    }
  }
  else
  {
    v2 = operator new(8u);
    sub_180077590(v2);
    v6 = v2;
    if ( (unsigned __int8)sub_1800B54B2((_DWORD)a1, 0, 0, 0, (__int64)&v6, (__int64)"parent_child_ipc.mojom.ParentIpc") )
    {
      v3 = a1[1];
      v4 = operator new(0x10u);
      sub_18003E92C(v4, v3);
      v5 = (void (__fastcall ***)(_QWORD, __int64))a1[5];
      a1[5] = v4;
      if ( v5 )
        (**v5)(v5, 1);
    }
  }
}
