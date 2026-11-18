__int64 __fastcall sub_180021370(__int64 a1)
{
  unsigned __int64 v2; // rax
  unsigned __int64 v3; // rbx
  __int64 v4; // rdi
  unsigned __int64 v5; // rax
  const CHAR *v6; // rax
  unsigned __int64 v7; // rcx
  LPCSTR *v8; // rbx
  char *v9; // rbx
  __int64 v10; // rdi
  const char *v11; // rbx
  const char *v12; // rax
  const CHAR *v13; // rcx
  HMODULE LibraryA; // rax
  DWORD LastError; // edi
  void *v16; // rcx
  unsigned __int8 v17; // bl
  HRESULT (__stdcall *DllGetClassObject)(const IID *const, const IID *const, LPVOID *); // rax
  __int64 v19; // rcx
  CHAR *v20; // rcx
  unsigned __int8 v22; // [rsp+30h] [rbp-D0h]
  __int64 v23; // [rsp+38h] [rbp-C8h] BYREF
  DWORD v24; // [rsp+40h] [rbp-C0h] BYREF
  _QWORD v25[2]; // [rsp+48h] [rbp-B8h] BYREF
  LPCSTR lpLibFileName[2]; // [rsp+58h] [rbp-A8h] BYREF
  unsigned __int64 v27; // [rsp+68h] [rbp-98h]
  unsigned __int64 v28; // [rsp+70h] [rbp-90h]
  _QWORD v29[3]; // [rsp+78h] [rbp-88h] BYREF
  unsigned __int64 v30; // [rsp+90h] [rbp-70h]
  CHAR Filename[272]; // [rsp+A0h] [rbp-60h] BYREF

  sub_18019B8F0(Filename, 0, 261);
  GetModuleFileNameA((HMODULE)0x180000000LL, Filename, 0x104u);
  PathRemoveFileSpecA(Filename);
  PathAddBackslashA(Filename);
  *(_OWORD *)lpLibFileName = 0;
  v27 = 0;
  v28 = 0;
  v2 = sub_18019C4B0(Filename);
  v3 = v2;
  v4 = 0x7FFFFFFFFFFFFFFFLL;
  if ( v2 > 0x7FFFFFFFFFFFFFFFLL )
    std::vector<void *>::_Xlen();
  if ( v2 > 0xF )
  {
    v5 = v2 | 0xF;
    if ( v5 <= 0x7FFFFFFFFFFFFFFFLL )
    {
      v4 = v5;
      if ( v5 < 0x16 )
        v4 = 22;
      if ( (unsigned __int64)(v4 + 1) < 0x1000 )
        v6 = (const CHAR *)sub_180119918();
      else
        v6 = (const CHAR *)((__int64 (*)(void))sub_1800023C0)();
    }
    else
    {
      v6 = (const CHAR *)sub_1800023C0(0x8000000000000000uLL);
    }
    lpLibFileName[0] = v6;
    v27 = v3;
    v28 = v4;
    sub_18019BD90(v6, Filename, v3);
    lpLibFileName[0][v3] = 0;
  }
  else
  {
    v27 = v2;
    v28 = 15;
    sub_18019BD90(lpLibFileName, Filename, v2);
    *((_BYTE *)lpLibFileName + v3) = 0;
  }
  v7 = v27;
  if ( v28 - v27 < 0x16 )
  {
    sub_18000BB40((unsigned int)lpLibFileName, 22, v22, (unsigned int)"child-ipc-core-x64.dll", 22);
  }
  else
  {
    v27 += 22LL;
    v8 = lpLibFileName;
    if ( v28 > 0xF )
      v8 = (LPCSTR *)lpLibFileName[0];
    v9 = (char *)v8 + v7;
    sub_18019BD90(v9, "child-ipc-core-x64.dll", 22);
    v9[22] = 0;
  }
  v10 = sub_180004FD0(v29, lpLibFileName);
  v11 = "E:\\msf-ng\\wrapper\\ipc\\ipc_service.cc";
  if ( sub_18013B9A8("E:\\msf-ng\\wrapper\\ipc\\ipc_service.cc", 92) )
    LODWORD(v12) = sub_18013B9A8("E:\\msf-ng\\wrapper\\ipc\\ipc_service.cc", 92) + 1;
  else
    v12 = "E:\\msf-ng\\wrapper\\ipc\\ipc_service.cc";
  sub_18000D920(2, (_DWORD)v12, 95, (unsigned int)"InitIPC4Win", (__int64)"InitIPC4Win strPath:{}!", v10);
  v13 = (const CHAR *)lpLibFileName;
  if ( v28 > 0xF )
    v13 = lpLibFileName[0];
  LibraryA = LoadLibraryA(v13);
  if ( !LibraryA )
  {
    LastError = GetLastError();
    if ( sub_18013B9A8("E:\\msf-ng\\wrapper\\ipc\\ipc_service.cc", 92) )
      v11 = (const char *)(sub_18013B9A8("E:\\msf-ng\\wrapper\\ipc\\ipc_service.cc", 92) + 1);
    v24 = LastError;
    if ( (unsigned __int8)sub_18002FC20(2) )
    {
      v25[0] = "IPCService InitIPC error: {}";
      v25[1] = 28;
      sub_18001F750(v29, v25, &v24);
      sub_18002F7F0(2, (_DWORD)v11, 98, (unsigned int)"InitIPC4Win", (__int64)v29);
      if ( v30 > 0xF )
      {
        v16 = (void *)v29[0];
        if ( v30 + 1 >= 0x1000 )
        {
          v16 = *(void **)(v29[0] - 8LL);
          if ( (unsigned __int64)(v29[0] - (_QWORD)v16 - 8LL) > 0x1F )
          {
            sub_18013FE4C(0, 0, 0, 0, 0);
            JUMPOUT(0x1800217A0LL);
          }
        }
        sub_180119954(v16);
        v17 = 0;
        goto LABEL_39;
      }
    }
LABEL_31:
    v17 = 0;
    goto LABEL_39;
  }
  DllGetClassObject = (HRESULT (__stdcall *)(const IID *const, const IID *const, LPVOID *))GetProcAddress(
                                                                                             LibraryA,
                                                                                             "DllGetClassObject");
  if ( !DllGetClassObject )
    goto LABEL_31;
  v23 = 0;
  if ( ((int (__fastcall *)(void *, void *, __int64 *))DllGetClassObject)(&unk_1801A9D88, &unk_1801C0AE8, &v23) >= 0
    && (*(int (__fastcall **)(__int64, _QWORD, void *, __int64))(*(_QWORD *)v23 + 24LL))(
         v23,
         0,
         &unk_1801A9D78,
         a1 + 24) >= 0
    && (v19 = *(_QWORD *)(a1 + 24)) != 0 )
  {
    (*(void (__fastcall **)(__int64, __int64 (__fastcall *)(int, int, int, int, int), _QWORD))(*(_QWORD *)v19 + 40LL))(
      v19,
      sub_1800217B0,
      0);
    (*(void (__fastcall **)(_QWORD))(**(_QWORD **)(a1 + 24) + 24LL))(*(_QWORD *)(a1 + 24));
    v17 = 1;
  }
  else
  {
    v17 = 0;
  }
  if ( v23 )
  {
    (*(void (__fastcall **)(__int64))(*(_QWORD *)v23 + 16LL))(v23);
    v23 = 0;
  }
LABEL_39:
  if ( v28 > 0xF )
  {
    v20 = (CHAR *)lpLibFileName[0];
    if ( v28 + 1 >= 0x1000 )
    {
      v20 = *((CHAR **)lpLibFileName[0] - 1);
      if ( (unsigned __int64)(lpLibFileName[0] - (LPCSTR)v20 - 8) > 0x1F )
      {
        sub_18013FE4C(0, 0, 0, 0, 0);
        __debugbreak();
      }
    }
    sub_180119954(v20);
  }
  return v17;
}
