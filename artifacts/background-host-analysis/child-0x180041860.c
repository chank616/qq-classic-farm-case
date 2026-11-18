__int64 __fastcall sub_180041860(__int64 a1, __int64 a2, int a3, __int64 a4, __int64 a5, __int64 a6)
{
  unsigned int v9; // ebp
  __int64 v10; // rdi
  __int64 v11; // rsi
  volatile signed __int32 *v12; // rsi
  unsigned int v14; // [rsp+2Ch] [rbp-BCh] BYREF
  _BYTE v15[16]; // [rsp+30h] [rbp-B8h] BYREF
  __int128 v16; // [rsp+40h] [rbp-A8h] BYREF
  _BYTE v17[16]; // [rsp+50h] [rbp-98h] BYREF
  __int64 v18; // [rsp+60h] [rbp-88h] BYREF
  WCHAR FileName[20]; // [rsp+70h] [rbp-78h] BYREF

  wmemcpy(FileName, L"ꪪꪪꪪꪪꪪꪪꪪꪪꪪꪪꪪꪪꪪꪪꪪꪪ", 16);
  sub_180041A0E(v17);
  sub_180080110(FileName);
  v9 = 0;
  if ( (unsigned __int8)sub_180082D00(FileName) )
  {
    v16 = xmmword_180152040;
    sub_180041A8C(&v16);
    sub_18008345E(v16, a5, a6);
    sub_18008341C(v16);
    sub_180083454(v16);
    if ( a3 > 0 )
    {
      v10 = 0;
      do
      {
        v11 = v16;
        sub_180041AE6(v15, *(_QWORD *)(a4 + 8 * v10));
        sub_180083430(v11, v15);
        ++v10;
      }
      while ( a3 != v10 );
    }
    sub_180083426(v16, FileName);
    v9 = 0;
    if ( (unsigned __int8)sub_18008346E(v16) )
    {
      v14 = sub_180083BFA(v16);
      if ( v14 )
      {
        sub_180042C70(a1 + 200, &v18, &v14);
        sub_180041B64(v18 + 24, &v16);
        v9 = v14;
      }
      else
      {
        v9 = 0;
      }
    }
    v12 = *((volatile signed __int32 **)&v16 + 1);
    if ( *((_QWORD *)&v16 + 1) )
    {
      if ( !_InterlockedDecrement((volatile signed __int32 *)(*((_QWORD *)&v16 + 1) + 8LL)) )
      {
        (**(void (__fastcall ***)(volatile signed __int32 *))v12)(v12);
        if ( !_InterlockedDecrement(v12 + 3) )
          (*(void (__fastcall **)(volatile signed __int32 *))(*(_QWORD *)v12 + 8LL))(v12);
      }
    }
  }
  sub_1800801F0(FileName);
  return v9;
}
