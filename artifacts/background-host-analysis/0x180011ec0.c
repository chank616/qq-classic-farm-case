__int64 __fastcall sub_180011EC0(_QWORD *a1, _QWORD *a2, _QWORD *a3)
{
  __int64 v6; // rax
  __int64 v7; // rax
  __int64 v8; // rcx
  volatile signed __int32 *v9; // rdi
  const char *v10; // rdi
  const char *v11; // rsi
  void *v12; // rcx
  volatile signed __int32 *v13; // rsi
  const char *v14; // rsi
  void *v15; // rcx
  __int64 v16; // rsi
  __int64 v17; // r14
  __int64 v18; // r12
  __int64 v19; // r13
  const char *v20; // rax
  __int64 result; // rax
  __int64 v22; // rax
  void *v23; // rcx
  __int64 v24; // rax
  void *v25; // rcx
  __int64 v26; // rax
  void *v27; // rcx
  void *v28; // rcx
  const char *v29; // [rsp+70h] [rbp-90h] BYREF
  __int64 v30; // [rsp+78h] [rbp-88h]
  _QWORD *v31; // [rsp+80h] [rbp-80h]
  _BYTE *v32; // [rsp+88h] [rbp-78h]
  __int64 v33; // [rsp+90h] [rbp-70h]
  __int64 v34; // [rsp+98h] [rbp-68h]
  _BYTE *v35; // [rsp+A0h] [rbp-60h]
  _BYTE v36[32]; // [rsp+A8h] [rbp-58h] BYREF
  _BYTE v37[32]; // [rsp+C8h] [rbp-38h] BYREF
  _BYTE v38[32]; // [rsp+E8h] [rbp-18h] BYREF
  _QWORD v39[3]; // [rsp+108h] [rbp+8h] BYREF
  unsigned __int64 v40; // [rsp+120h] [rbp+20h]

  v6 = sub_180004FD0(v39, a2 + 9);
  sub_180010190(a1, v6);
  v7 = a3[1];
  if ( v7 )
    _InterlockedIncrement((volatile signed __int32 *)(v7 + 8));
  v8 = a3[1];
  a1[9] = *a3;
  v9 = (volatile signed __int32 *)a1[10];
  a1[10] = v8;
  if ( v9 )
  {
    if ( _InterlockedExchangeAdd(v9 + 2, 0xFFFFFFFF) == 1 )
    {
      (**(void (__fastcall ***)(volatile signed __int32 *))v9)(v9);
      if ( _InterlockedExchangeAdd(v9 + 3, 0xFFFFFFFF) == 1 )
        (*(void (__fastcall **)(volatile signed __int32 *))(*(_QWORD *)v9 + 8LL))(v9);
    }
  }
  a1[12] = *a2;
  sub_18000FD90(a1 + 13, a2 + 1);
  sub_18000FD90(a1 + 17, a2 + 5);
  sub_18000FD90(a1 + 21, a2 + 9);
  sub_18000FD90(a1 + 25, a2 + 13);
  sub_18000FD90(a1 + 29, a2 + 17);
  sub_18000FD90(a1 + 33, a2 + 21);
  sub_18000FD90(a1 + 37, a2 + 25);
  sub_18000FD90(a1 + 41, a2 + 29);
  v10 = "E:\\msf-ng\\wrapper\\msf_wrapper_session.cc";
  if ( sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) )
    v11 = (const char *)(sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) + 1);
  else
    v11 = "E:\\msf-ng\\wrapper\\msf_wrapper_session.cc";
  if ( (unsigned __int8)sub_18002FC20(2) )
  {
    v29 = "NT-Kernel getipcservice";
    v30 = 23;
    sub_18000C770(v39, &v29);
    sub_18002F7F0(2, (_DWORD)v11, 40, (unsigned int)&unk_1801A8F56, (__int64)v39);
    if ( v40 > 0xF )
    {
      v12 = (void *)v39[0];
      if ( v40 + 1 >= 0x1000 )
      {
        v12 = *(void **)(v39[0] - 8LL);
        if ( (unsigned __int64)(v39[0] - (_QWORD)v12 - 8LL) > 0x1F )
        {
          sub_18013FE4C(0, 0, 0, 0, 0);
          __debugbreak();
        }
      }
      sub_180119954(v12);
    }
  }
  (*(void (__fastcall **)(_QWORD *, const char **))(*a1 + 32LL))(a1, &v29);
  v13 = (volatile signed __int32 *)v30;
  if ( v30 )
  {
    if ( _InterlockedExchangeAdd((volatile signed __int32 *)(v30 + 8), 0xFFFFFFFF) == 1 )
    {
      (**(void (__fastcall ***)(volatile signed __int32 *))v13)(v13);
      if ( _InterlockedExchangeAdd(v13 + 3, 0xFFFFFFFF) == 1 )
        (*(void (__fastcall **)(volatile signed __int32 *))(*(_QWORD *)v13 + 8LL))(v13);
    }
  }
  if ( sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) )
    v14 = (const char *)(sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) + 1);
  else
    v14 = "E:\\msf-ng\\wrapper\\msf_wrapper_session.cc";
  if ( (unsigned __int8)sub_18002FC20(2) )
  {
    v29 = "NT-Kernel getipcservice end.";
    v30 = 28;
    sub_18000C770(v39, &v29);
    sub_18002F7F0(2, (_DWORD)v14, 42, (unsigned int)&unk_1801A8F56, (__int64)v39);
    if ( v40 > 0xF )
    {
      v15 = (void *)v39[0];
      if ( v40 + 1 >= 0x1000 )
      {
        v15 = *(void **)(v39[0] - 8LL);
        if ( (unsigned __int64)(v39[0] - (_QWORD)v15 - 8LL) > 0x1F )
        {
          sub_18013FE4C(0, 0, 0, 0, 0);
          __debugbreak();
        }
      }
      sub_180119954(v15);
    }
  }
  sub_1800224F0(a1[7]);
  v31 = v39;
  v16 = sub_180004FD0(v39, a2 + 9);
  v32 = v36;
  v17 = sub_180004FD0(v36, a2 + 5);
  v35 = v37;
  v18 = sub_180004FD0(v37, a2 + 13);
  v19 = a2[27];
  v33 = a2[23];
  v34 = a2[19];
  v32 = (_BYTE *)sub_180004FD0(v38, a2 + 1);
  v31 = (_QWORD *)*a2;
  if ( sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) )
    LODWORD(v20) = sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) + 1;
  else
    v20 = "E:\\msf-ng\\wrapper\\msf_wrapper_session.cc";
  result = sub_18000DDB0(
             (unsigned int)"MSFWrapperSession",
             2,
             (_DWORD)v20,
             49,
             (__int64)&unk_1801A8F56,
             (__int64)"session begin init with uin:{} uid:{} a2 size:{} d2 size:{} d2key size: {} clientVer:{} sysPath:{} userPath:{}",
             (char)v31,
             (__int64)v32,
             v34,
             v33,
             v19,
             v18,
             v17,
             v16);
  if ( a2[19] )
  {
    v22 = sub_1800112E0(a1, v39, a2 + 17);
    sub_180002A70(a1 + 29, v22);
    if ( v40 > 0xF )
    {
      v23 = (void *)v39[0];
      if ( v40 + 1 >= 0x1000 )
      {
        v23 = *(void **)(v39[0] - 8LL);
        if ( (unsigned __int64)(v39[0] - (_QWORD)v23 - 8LL) > 0x1F )
        {
          sub_18013FE4C(0, 0, 0, 0, 0);
          __debugbreak();
        }
      }
      sub_180119954(v23);
    }
    v24 = sub_1800112E0(a1, v39, a2 + 21);
    sub_180002A70(a1 + 33, v24);
    if ( v40 > 0xF )
    {
      v25 = (void *)v39[0];
      if ( v40 + 1 >= 0x1000 )
      {
        v25 = *(void **)(v39[0] - 8LL);
        if ( (unsigned __int64)(v39[0] - (_QWORD)v25 - 8LL) > 0x1F )
        {
          sub_18013FE4C(0, 0, 0, 0, 0);
          __debugbreak();
        }
      }
      sub_180119954(v25);
    }
    v26 = sub_1800112E0(a1, v39, a2 + 25);
    sub_180002A70(a1 + 37, v26);
    if ( v40 > 0xF )
    {
      v27 = (void *)v39[0];
      if ( v40 + 1 >= 0x1000 )
      {
        v27 = *(void **)(v39[0] - 8LL);
        if ( (unsigned __int64)(v39[0] - (_QWORD)v27 - 8LL) > 0x1F )
        {
          sub_18013FE4C(0, 0, 0, 0, 0);
          JUMPOUT(0x180012560LL);
        }
      }
      sub_180119954(v27);
    }
    if ( sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) )
      v10 = (const char *)(sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) + 1);
    if ( (unsigned __int8)sub_18002FC20(2) )
    {
      v29 = "NT-Kernel Init Msf from local a2.";
      v30 = 33;
      sub_18000C770(v39, &v29);
      sub_18002F7F0(2, (_DWORD)v10, 54, (unsigned int)&unk_1801A8F56, (__int64)v39);
      if ( v40 > 0xF )
      {
        v28 = (void *)v39[0];
        if ( v40 + 1 >= 0x1000 )
        {
          v28 = *(void **)(v39[0] - 8LL);
          if ( (unsigned __int64)(v39[0] - (_QWORD)v28 - 8LL) > 0x1F )
          {
            sub_18013FE4C(0, 0, 0, 0, 0);
            __debugbreak();
          }
        }
        sub_180119954(v28);
      }
    }
    return sub_180010450(a1);
  }
  return result;
}
