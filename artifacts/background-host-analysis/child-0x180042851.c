__int64 *sub_180042851()
{
  if ( dword_180187A68 > *(_DWORD *)(*((_QWORD *)NtCurrentTeb()->ThreadLocalStoragePointer + (unsigned int)TlsIndex)
                                   + 4LL) )
  {
    Init_thread_header(&dword_180187A68);
    if ( dword_180187A68 == -1 )
    {
      qword_180187A40 = (__int64)&off_180157330;
      Init_thread_footer(&dword_180187A68);
    }
  }
  return &qword_180187A40;
}
