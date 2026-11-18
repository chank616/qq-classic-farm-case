__int64 __fastcall sub_18003F6A4(__int64 a1, __int64 a2)
{
  int v4; // eax
  unsigned int v5; // edi
  _QWORD *v6; // rbx
  __int64 v7; // rax
  __int64 v8; // rcx
  __int64 v9; // r14
  __int64 v10; // rax
  void *v11; // rcx
  void *v12; // rcx
  _BYTE v14[8]; // [rsp+28h] [rbp-90h] BYREF
  __int128 v15; // [rsp+30h] [rbp-88h] BYREF
  __int64 v16; // [rsp+40h] [rbp-78h]
  _BYTE v17[32]; // [rsp+50h] [rbp-68h] BYREF
  __m256i v18; // [rsp+70h] [rbp-48h] BYREF

  v4 = *(_DWORD *)(sub_18003FA02(a2) + 12);
  if ( v4 == 649179546 )
  {
    memset(v17, 170, 24);
    sub_180053170(v17, 2551901881LL);
    if ( !*(_BYTE *)(a2 + 105) )
    {
      sub_1800435B0(&v18, "gen/parent_child_ipc/core/mojom/ipc.mojom.cc", 441, "message->is_serialized()");
      sub_180043630(&v18);
      sub_180043640(&v18);
    }
    v6 = (_QWORD *)sub_180075C30(a2);
    v18.m256i_i64[1] = 0xAAAAAAAAAAAAAAAAuLL;
    v18.m256i_i64[0] = 0;
    *(_OWORD *)&v18.m256i_u64[2] = xmmword_180152050;
    v16 = 0;
    v15 = 0;
    v7 = v6[1];
    v8 = (__int64)v6 + v7 + 8;
    if ( !v7 )
      v8 = 0;
    if ( !(unsigned __int8)sub_1800402D6(v8, &v18, a2) )
      goto LABEL_15;
    v9 = v6[2];
    v10 = v6[3];
    if ( v10 )
    {
      if ( !(unsigned __int8)sub_180040346((char *)v6 + v10 + 24, &v15, a2) )
      {
LABEL_15:
        sub_1800789E0(a2, 17, (unsigned int)"parent_child_ipc.mojom.ChildIpc", 1, 0);
        LODWORD(a1) = 0;
        goto LABEL_21;
      }
    }
    else
    {
      *((_QWORD *)&v15 + 1) = 0;
    }
    if ( !a1 )
    {
      sub_1800435B0(v14, "gen/parent_child_ipc/core/mojom/ipc.mojom.cc", 466, "impl");
      sub_180043630(v14);
      sub_180043640(v14);
    }
    (*(void (__fastcall **)(__int64, __m256i *, __int64, __int128 *))(*(_QWORD *)a1 + 16LL))(a1, &v18, v9, &v15);
    LOBYTE(a1) = 1;
LABEL_21:
    v11 = (void *)v15;
    if ( (_QWORD)v15 )
    {
      if ( (unsigned __int64)(v16 - v15) >= 0x1000 )
      {
        if ( (unsigned __int64)(v15 - 8 - *(_QWORD *)(v15 - 8)) >= 0x20 )
          goto LABEL_33;
        v11 = *(void **)(v15 - 8);
      }
      j_j_free_0(v11);
    }
    if ( v18.m256i_i64[3] < 0x10uLL )
    {
LABEL_31:
      sub_180053550(v17);
      return (unsigned int)a1;
    }
    v12 = (void *)v18.m256i_i64[0];
    if ( (unsigned __int64)(v18.m256i_i64[3] + 1) < 0x1000 )
    {
LABEL_30:
      j_j_free_0(v12);
      goto LABEL_31;
    }
    if ( (unsigned __int64)(v18.m256i_i64[0] - 8 - *(_QWORD *)(v18.m256i_i64[0] - 8)) < 0x20 )
    {
      v12 = *(void **)(v18.m256i_i64[0] - 8);
      goto LABEL_30;
    }
LABEL_33:
    invalid_parameter_noinfo_noreturn();
  }
  if ( v4 == 1455163304 )
  {
    memset(&v18, 170, 24);
    sub_180053170(&v18, 316443381);
    if ( !*(_BYTE *)(a2 + 105) )
    {
      sub_1800435B0(v17, "gen/parent_child_ipc/core/mojom/ipc.mojom.cc", 406, "message->is_serialized()");
      sub_180043630(v17);
      sub_180043640(v17);
    }
    v5 = *(_DWORD *)(sub_180075C30(a2) + 8);
    if ( !a1 )
    {
      sub_1800435B0(v17, "gen/parent_child_ipc/core/mojom/ipc.mojom.cc", 425, "impl");
      sub_180043630(v17);
      sub_180043640(v17);
    }
    (*(void (__fastcall **)(__int64, _QWORD))(*(_QWORD *)a1 + 8LL))(a1, v5);
    sub_180053550(&v18);
    LOBYTE(a1) = 1;
  }
  else
  {
    LODWORD(a1) = 0;
  }
  return (unsigned int)a1;
}
