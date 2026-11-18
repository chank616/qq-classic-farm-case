__int64 __fastcall sub_180041660(__int64 a1)
{
  __int64 (__fastcall *v2)(); // [rsp+20h] [rbp-18h] BYREF
  __int64 v3; // [rsp+28h] [rbp-10h] BYREF

  v3 = a1;
  v2 = sub_1800416C0;
  if ( *(_DWORD *)(a1 + 8) != 221 )
    ((void (__fastcall *)(__int64, __int64, __int64 (__fastcall **)(), __int64 *))sub_180042AE1)(a1 + 8, 1, &v2, &v3);
  return 0;
}
