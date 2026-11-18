void *sub_18004249B()
{
  if ( dword_180187A38 > *(_DWORD *)(*((_QWORD *)NtCurrentTeb()->ThreadLocalStoragePointer + (unsigned int)TlsIndex)
                                   + 4LL) )
  {
    Init_thread_header(&dword_180187A38);
    if ( dword_180187A38 == -1 )
    {
      sub_1800414F0(&unk_180187870);
      Init_thread_footer(&dword_180187A38);
    }
  }
  return &unk_180187870;
}
