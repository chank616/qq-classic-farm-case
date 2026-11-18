from pathlib import Path
roots=[Path(r'C:\Users\chank616\AppData\Roaming\QQEX\miniapp\temps\miniapp_src'),Path(r'C:\Users\chank616\AppData\Roaming\QQEX\miniapp\fs\2351686624\1112386029'),Path(r'C:\Users\chank616\AppData\Roaming\QQEX\miniapp\fs\3310219138\1112386029')]
for root in roots:
 print('\nROOT',root,'exists',root.exists())
 if not root.exists(): continue
 files=[p for p in root.rglob('*') if p.is_file()]
 print('files',len(files),'bytes',sum(p.stat().st_size for p in files))
 terms=('mcboot','subpackages','proto','gateway','login','farm')
 hits=[p for p in files if any(t in str(p).lower() for t in terms)]
 print('named hits',len(hits))
 for p in hits[:50]: print(' ',p.relative_to(root),p.stat().st_size)
 if root.name=='miniapp_src':
  versions=sorted((p for p in root.iterdir() if p.is_dir() and p.name.startswith('1112386029_')),key=lambda p:p.stat().st_mtime,reverse=True)
  print('appid versions',len(versions))
  for v in versions[:3]:
   print(' version',v.name,'files',sum(1 for x in v.rglob('*') if x.is_file()),'mcboot-paths',[str(x.relative_to(v)) for x in v.rglob('*') if 'mcboot' in str(x).lower()][:10])
