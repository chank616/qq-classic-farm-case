__int64 __fastcall sub_1800127C0(_QWORD *a1, __int64 a2)
{
  const char *v4; // rdi
  const char *v5; // rax
  __int64 v6; // r9
  __int64 v7; // rax
  __int64 v8; // rax
  __int64 v9; // rax
  __int64 v10; // rax
  void *v11; // rcx
  void *v12; // rcx
  __int64 v13; // rbx
  const char *v14; // rax
  __int64 v15; // rax
  __int64 v16; // rax
  __int64 v17; // rax
  __int64 v18; // rax
  void *v19; // rcx
  void *v20; // rcx
  __int64 v21; // rbx
  const char *v22; // rax
  __int64 v23; // rax
  __int64 v24; // rax
  __int64 v25; // rax
  __int64 v26; // rax
  void *v27; // rcx
  void *v28; // rcx
  __int64 v29; // rbx
  const char *v30; // rax
  __int64 v31; // rax
  __int64 v32; // rax
  __int64 v33; // rsi
  char *v34; // rbx
  void *v35; // rcx
  void *v36; // rcx
  __int64 v37; // rax
  __int64 v38; // rax
  __int64 v39; // rax
  void *v40; // rcx
  __int64 v41; // rbx
  const char *v42; // rax
  __int64 v43; // rax
  __int64 v44; // rax
  __int64 v45; // rax
  void *v46; // rcx
  __int64 v47; // rbx
  unsigned __int64 v48; // rsi
  unsigned __int64 v49; // r15
  __int64 v50; // r12
  int v51; // eax
  void *v52; // rcx
  void *v53; // rcx
  _BYTE v55[8]; // [rsp+40h] [rbp-C0h] BYREF
  const char *v56; // [rsp+48h] [rbp-B8h] BYREF
  const char *v57; // [rsp+50h] [rbp-B0h] BYREF
  __int64 v58; // [rsp+58h] [rbp-A8h]
  _BYTE v59[40]; // [rsp+60h] [rbp-A0h] BYREF
  _QWORD v60[2]; // [rsp+88h] [rbp-78h] BYREF
  _QWORD v61[2]; // [rsp+98h] [rbp-68h] BYREF
  char v62; // [rsp+A8h] [rbp-58h] BYREF
  unsigned __int64 v63; // [rsp+B0h] [rbp-50h]
  _QWORD v64[2]; // [rsp+B8h] [rbp-48h] BYREF
  __m128i si128; // [rsp+C8h] [rbp-38h]
  __int64 v66; // [rsp+E0h] [rbp-20h] BYREF
  __int128 v67; // [rsp+E8h] [rbp-18h] BYREF
  __int64 v68; // [rsp+F8h] [rbp-8h]
  __int64 v69; // [rsp+100h] [rbp+0h]
  __int128 v70; // [rsp+108h] [rbp+8h] BYREF
  __int64 v71; // [rsp+118h] [rbp+18h]
  __int64 v72; // [rsp+120h] [rbp+20h]
  _QWORD *v73; // [rsp+130h] [rbp+30h] BYREF
  __int64 v74; // [rsp+138h] [rbp+38h] BYREF
  _BYTE v75[32]; // [rsp+140h] [rbp+40h] BYREF
  _BYTE v76[32]; // [rsp+160h] [rbp+60h] BYREF
  _BYTE v77[16]; // [rsp+180h] [rbp+80h] BYREF
  _BYTE v78[32]; // [rsp+190h] [rbp+90h] BYREF
  _BYTE v79[32]; // [rsp+1B0h] [rbp+B0h] BYREF
  _BYTE v80[192]; // [rsp+1D0h] [rbp+D0h] BYREF

  v60[1] = a2;
  v4 = "E:\\msf-ng\\wrapper\\msf_wrapper_session.cc";
  if ( sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) )
    LODWORD(v5) = sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) + 1;
  else
    v5 = "E:\\msf-ng\\wrapper\\msf_wrapper_session.cc";
  sub_18000D790(
    (unsigned int)"MSFWrapperSession",
    2,
    (_DWORD)v5,
    177,
    (__int64)&unk_1801A8F56,
    (__int64)"ipc onRecvToken");
  sub_180088040(v59, 0);
  sub_180087B70(v80);
  LOBYTE(v6) = 1;
  if ( !(unsigned __int8)sub_18008E850(v80, a2, v59, v6) )
  {
    v66 = 0;
    v67 = 0;
    v68 = 0;
    v48 = 15;
    v69 = 15;
    LOBYTE(v67) = 0;
    v70 = 0;
    v71 = 0;
    v49 = 15;
    v72 = 15;
    LOBYTE(v70) = 0;
    v50 = sub_180004FD0(v61, a2);
    if ( sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) )
      v4 = (const char *)(sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) + 1);
    sub_18000DA30(
      (unsigned int)"MSFWrapperSession",
      4,
      (_DWORD)v4,
      209,
      (__int64)&unk_1801A8F56,
      (__int64)"onRecvToken invaild with : {}",
      v50);
    if ( !(unsigned __int8)sub_180004600(a1 + 7, 0) )
    {
      v73 = a1 - 2;
      v56 = (const char *)&v74;
      v74 = 0;
      sub_180004FD0(v75, &v67);
      sub_180004FD0(v76, &v70);
      v51 = sub_18000E190(v77, 0, &v73, v55);
      sub_18000D4D0(0, v51, (unsigned int)&v62, (unsigned int)v61, 16);
      sub_180003C60(v79);
      sub_180003C60(v78);
      sub_1800110D0(v61);
      sub_180003C60(v76);
      sub_180003C60(v75);
      v49 = v72;
      v48 = v69;
    }
    if ( v49 > 0xF )
    {
      v52 = (void *)v70;
      if ( v49 + 1 >= 0x1000 )
      {
        v52 = *(void **)(v70 - 8);
        if ( (unsigned __int64)(v70 - (_QWORD)v52 - 8) > 0x1F )
        {
LABEL_88:
          sub_18013FE4C(0, 0, 0, 0, 0);
          goto LABEL_89;
        }
      }
      sub_180119954(v52);
    }
    if ( v48 <= 0xF )
      goto LABEL_87;
    v53 = (void *)v67;
    if ( v48 + 1 < 0x1000 || (v53 = *(void **)(v67 - 8), (unsigned __int64)(v67 - (_QWORD)v53 - 8) <= 0x1F) )
    {
      sub_180119954(v53);
      goto LABEL_87;
    }
    goto LABEL_88;
  }
  sub_180088040(&v66, 0);
  v7 = sub_180088930(v59, "a2");
  if ( !(unsigned __int8)sub_1800886C0(v7, &v66) )
    goto LABEL_18;
  v8 = sub_180088930(v59, "a2");
  v9 = sub_18008A5D0(v8, v61);
  v10 = sub_1800112E0(a1 - 2, v64, v9);
  sub_180002A70(a1 + 27, v10);
  if ( si128.m128i_i64[1] > 0xFuLL )
  {
    v11 = (void *)v64[0];
    if ( (unsigned __int64)(si128.m128i_i64[1] + 1) < 0x1000
      || (v11 = *(void **)(v64[0] - 8LL), (unsigned __int64)(v64[0] - (_QWORD)v11 - 8LL) <= 0x1F) )
    {
      sub_180119954(v11);
      goto LABEL_10;
    }
LABEL_89:
    sub_18013FE4C(0, 0, 0, 0, 0);
    goto LABEL_90;
  }
LABEL_10:
  si128 = _mm_load_si128(xmmword_1801A7BC0);
  LOBYTE(v64[0]) = 0;
  if ( v63 > 0xF )
  {
    v12 = (void *)v61[0];
    if ( v63 + 1 < 0x1000 || (v12 = *(void **)(v61[0] - 8LL), (unsigned __int64)(v61[0] - (_QWORD)v12 - 8LL) <= 0x1F) )
    {
      sub_180119954(v12);
      goto LABEL_14;
    }
LABEL_90:
    sub_18013FE4C(0, 0, 0, 0, 0);
    goto LABEL_91;
  }
LABEL_14:
  v13 = a1[29];
  if ( sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) )
    LODWORD(v14) = sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) + 1;
  else
    v14 = "E:\\msf-ng\\wrapper\\msf_wrapper_session.cc";
  sub_18000DFE0(
    (unsigned int)"MSFWrapperSession",
    2,
    (_DWORD)v14,
    184,
    (__int64)&unk_1801A8F56,
    (__int64)"ipc recv a2:{}",
    v13);
LABEL_18:
  v15 = sub_180088930(v59, "d2");
  if ( !(unsigned __int8)sub_1800886C0(v15, &v66) )
    goto LABEL_31;
  v16 = sub_180088930(v59, "d2");
  v17 = sub_18008A5D0(v16, v61);
  v18 = sub_1800112E0(a1 - 2, v64, v17);
  sub_180002A70(a1 + 31, v18);
  if ( si128.m128i_i64[1] > 0xFuLL )
  {
    v19 = (void *)v64[0];
    if ( (unsigned __int64)(si128.m128i_i64[1] + 1) < 0x1000
      || (v19 = *(void **)(v64[0] - 8LL), (unsigned __int64)(v64[0] - (_QWORD)v19 - 8LL) <= 0x1F) )
    {
      sub_180119954(v19);
      goto LABEL_23;
    }
LABEL_91:
    sub_18013FE4C(0, 0, 0, 0, 0);
    goto LABEL_92;
  }
LABEL_23:
  si128 = _mm_load_si128(xmmword_1801A7BC0);
  LOBYTE(v64[0]) = 0;
  if ( v63 > 0xF )
  {
    v20 = (void *)v61[0];
    if ( v63 + 1 < 0x1000 || (v20 = *(void **)(v61[0] - 8LL), (unsigned __int64)(v61[0] - (_QWORD)v20 - 8LL) <= 0x1F) )
    {
      sub_180119954(v20);
      goto LABEL_27;
    }
LABEL_92:
    sub_18013FE4C(0, 0, 0, 0, 0);
    goto LABEL_93;
  }
LABEL_27:
  v21 = a1[33];
  if ( sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) )
    LODWORD(v22) = sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) + 1;
  else
    v22 = "E:\\msf-ng\\wrapper\\msf_wrapper_session.cc";
  sub_18000DFE0(
    (unsigned int)"MSFWrapperSession",
    2,
    (_DWORD)v22,
    188,
    (__int64)&unk_1801A8F56,
    (__int64)"ipc recv d2:{}",
    v21);
LABEL_31:
  v23 = sub_180088930(v59, "d2Key");
  if ( !(unsigned __int8)sub_1800886C0(v23, &v66) )
    goto LABEL_44;
  v24 = sub_180088930(v59, "d2Key");
  v25 = sub_18008A5D0(v24, v61);
  v26 = sub_1800112E0(a1 - 2, v64, v25);
  sub_180002A70(a1 + 35, v26);
  if ( si128.m128i_i64[1] > 0xFuLL )
  {
    v27 = (void *)v64[0];
    if ( (unsigned __int64)(si128.m128i_i64[1] + 1) < 0x1000
      || (v27 = *(void **)(v64[0] - 8LL), (unsigned __int64)(v64[0] - (_QWORD)v27 - 8LL) <= 0x1F) )
    {
      sub_180119954(v27);
      goto LABEL_36;
    }
LABEL_93:
    sub_18013FE4C(0, 0, 0, 0, 0);
    goto LABEL_94;
  }
LABEL_36:
  si128 = _mm_load_si128(xmmword_1801A7BC0);
  LOBYTE(v64[0]) = 0;
  if ( v63 > 0xF )
  {
    v28 = (void *)v61[0];
    if ( v63 + 1 < 0x1000 || (v28 = *(void **)(v61[0] - 8LL), (unsigned __int64)(v61[0] - (_QWORD)v28 - 8LL) <= 0x1F) )
    {
      sub_180119954(v28);
      goto LABEL_40;
    }
LABEL_94:
    sub_18013FE4C(0, 0, 0, 0, 0);
    goto LABEL_95;
  }
LABEL_40:
  v29 = a1[37];
  if ( sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) )
    LODWORD(v30) = sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) + 1;
  else
    v30 = "E:\\msf-ng\\wrapper\\msf_wrapper_session.cc";
  sub_18000DFE0(
    (unsigned int)"MSFWrapperSession",
    2,
    (_DWORD)v30,
    192,
    (__int64)&unk_1801A8F56,
    (__int64)"ipc recv d2Key:{}",
    v29);
LABEL_44:
  v31 = sub_180088930(v59, "uin");
  if ( !(unsigned __int8)sub_1800886C0(v31, &v66) )
    goto LABEL_57;
  v32 = sub_180088930(v59, "uin");
  v33 = sub_18008A750(v32);
  a1[10] = v33;
  v34 = sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92)
      ? (char *)(sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) + 1)
      : "E:\\msf-ng\\wrapper\\msf_wrapper_session.cc";
  v60[0] = v33;
  v56 = "MSFWrapperSession";
  if ( !(unsigned __int8)sub_18002FC20(2) )
    goto LABEL_57;
  v57 = "ipc recv uin:{}";
  v58 = 15;
  sub_18000C930(v61, &v57, v60);
  v57 = "[{}]->{}";
  v58 = 8;
  sub_18000C7A0(v64, &v57, &v56, v61);
  sub_18002F7F0(2, (_DWORD)v34, 196, (unsigned int)&unk_1801A8F56, (__int64)v64);
  if ( si128.m128i_i64[1] > 0xFuLL )
  {
    v35 = (void *)v64[0];
    if ( (unsigned __int64)(si128.m128i_i64[1] + 1) < 0x1000
      || (v35 = *(void **)(v64[0] - 8LL), (unsigned __int64)(v64[0] - (_QWORD)v35 - 8LL) <= 0x1F) )
    {
      sub_180119954(v35);
      goto LABEL_53;
    }
LABEL_95:
    sub_18013FE4C(0, 0, 0, 0, 0);
    goto LABEL_96;
  }
LABEL_53:
  si128 = _mm_load_si128(xmmword_1801A7BC0);
  LOBYTE(v64[0]) = 0;
  if ( v63 > 0xF )
  {
    v36 = (void *)v61[0];
    if ( v63 + 1 < 0x1000 || (v36 = *(void **)(v61[0] - 8LL), (unsigned __int64)(v61[0] - (_QWORD)v36 - 8LL) <= 0x1F) )
    {
      sub_180119954(v36);
      goto LABEL_57;
    }
LABEL_96:
    sub_18013FE4C(0, 0, 0, 0, 0);
    __debugbreak();
  }
LABEL_57:
  v37 = sub_180088930(v59, "uid");
  if ( (unsigned __int8)sub_1800886C0(v37, &v66) )
  {
    v38 = sub_180088930(v59, "uid");
    v39 = sub_18008A5D0(v38, v61);
    sub_180002A70(a1 + 11, v39);
    if ( v63 > 0xF )
    {
      v40 = (void *)v61[0];
      if ( v63 + 1 >= 0x1000 )
      {
        v40 = *(void **)(v61[0] - 8LL);
        if ( (unsigned __int64)(v61[0] - (_QWORD)v40 - 8LL) > 0x1F )
        {
          sub_18013FE4C(0, 0, 0, 0, 0);
          __debugbreak();
        }
      }
      sub_180119954(v40);
    }
    v41 = sub_180004FD0(v61, a1 + 11);
    if ( sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) )
      LODWORD(v42) = sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) + 1;
    else
      v42 = "E:\\msf-ng\\wrapper\\msf_wrapper_session.cc";
    sub_18000DA30(
      (unsigned int)"MSFWrapperSession",
      2,
      (_DWORD)v42,
      200,
      (__int64)&unk_1801A8F56,
      (__int64)"ipc recv uid:{}",
      v41);
  }
  v43 = sub_180088930(v59, "appid");
  if ( (unsigned __int8)sub_1800886C0(v43, &v66) )
  {
    v44 = sub_180088930(v59, "appid");
    v45 = sub_18008A5D0(v44, v61);
    sub_180002A70(a1 + 39, v45);
    if ( v63 > 0xF )
    {
      v46 = (void *)v61[0];
      if ( v63 + 1 >= 0x1000 )
      {
        v46 = *(void **)(v61[0] - 8LL);
        if ( (unsigned __int64)(v61[0] - (_QWORD)v46 - 8LL) > 0x1F )
        {
          sub_18013FE4C(0, 0, 0, 0, 0);
          JUMPOUT(0x1800132DELL);
        }
      }
      sub_180119954(v46);
    }
    v47 = sub_180004FD0(v61, a1 + 39);
    if ( sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) )
      v4 = (const char *)(sub_18013B9A8("E:\\msf-ng\\wrapper\\msf_wrapper_session.cc", 92) + 1);
    sub_18000DA30(
      (unsigned int)"MSFWrapperSession",
      2,
      (_DWORD)v4,
      204,
      (__int64)&unk_1801A8F56,
      (__int64)"ipc recv appid:{}",
      v47);
  }
  sub_180010450(a1 - 2);
  sub_1800883B0(&v66);
LABEL_87:
  sub_18000FBB0(v80);
  sub_1800883B0(v59);
  return sub_180003C60(a2);
}
