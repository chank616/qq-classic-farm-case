"""Attach only to an already-running QQ process; never spawn or restart QQ.

The agent returns interface metadata only. No account payloads or chat data.
"""
import ctypes, json, sys, threading, time, uuid, secrets, os, subprocess
from pathlib import Path
import frida

pid=int(sys.argv[1]); mode=sys.argv[2] if len(sys.argv)>2 else 'metadata'
if mode not in ('metadata','runtime','cache','code','objects','ipc','wrapper','scopes','ipcwatch','renderer','frontend','msfroute','frontscope','cleanup','session','auth','dispatcher','dispatchwatch','nativeauthapi','getcode','live'): raise ValueError('Unsupported diagnostic mode')
kernel=ctypes.WinDLL('kernel32',use_last_error=True)
kernel.OpenProcess.restype=ctypes.c_void_p
handle=kernel.OpenProcess(0x1000,False,pid)
if not handle: raise OSError(ctypes.get_last_error(),'Cannot inspect existing QQ')
try:
    name=ctypes.create_unicode_buffer(32768); length=ctypes.c_ulong(len(name))
    kernel.QueryFullProcessImageNameW.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_wchar_p,ctypes.POINTER(ctypes.c_ulong)]
    if not kernel.QueryFullProcessImageNameW(handle,0,name,ctypes.byref(length)): raise OSError('Cannot verify QQ image')
    if Path(name.value).name.lower()!='qq.exe': raise ValueError('Target is not QQ')
finally:
    kernel.CloseHandle.argtypes=[ctypes.c_void_p];kernel.CloseHandle(handle)
done=threading.Event(); messages=[]
result_file=Path('artifacts')/('.qq-probe-'+uuid.uuid4().hex+'.json')
pipe_name='QQFarm-Code-'+uuid.uuid4().hex;pipe_token=secrets.token_hex(32)
def receive(message,data):
    if message['type']=='send': messages.append(message['payload'])
    else: messages.append(dict(type=message['type'],description=message.get('description','')))
    if message.get('payload',{}).get('state')!='scheduled': done.set()
session=None
try:
    session=frida.get_local_device().attach(pid)
    agent="""
const modules=Process.enumerateModules().filter(m=>/^(QQNT\\.dll|wrapper\\.node|major\\.node|QQ\\.exe)$/i.test(m.name));
send({pid:Process.id,modules:modules.map(m=>({name:m.name,interfaces:m.enumerateExports().filter(x=>/^napi_(get_cb_info|run_script|create_string_utf8|get_value_string_utf8|get_global|typeof)$/.test(x.name)).map(x=>x.name)}))});
"""
    if mode in ('runtime','cache','code','ipc','wrapper','scopes','ipcwatch','renderer','frontend','msfroute','frontscope','cleanup','session','auth','dispatcher','dispatchwatch','nativeauthapi','getcode','live'):
        agent=Path('tools/probe_existing_qq_runtime.js').read_text(encoding='utf8')
        expression=Path('tools/qq_'+mode+'_metadata.js').read_text(encoding='utf8')
        request_id=str(int(time.time()*1000)%2147483647)
        expression=expression.replace('__QQ_REQUEST_ID__',request_id)
        if mode=='live': expression=expression.replace('__PIPE_NAME__',pipe_name).replace('__PIPE_AUTH_TOKEN__',pipe_token)
        agent=agent.replace('__QQ_PROBE_EXPRESSION__',json.dumps(expression))
        agent=agent.replace('__QQ_RESULT_FILE__',json.dumps(str(result_file.resolve())))
        if mode in ('auth','dispatchwatch'): agent=Path('tools/qq_observe_sso.js').read_text(encoding='utf8').replace('__QQ_REQUEST_ID__',request_id)+'\n'+agent
    if mode=='objects': agent=Path('tools/qq_observe_objects.js').read_text(encoding='utf8')
    script=session.create_script(agent)
    script.on('message',receive);script.load()
    if mode in ('metadata','objects'): done.wait(38 if mode=='objects' else 5)
    else:
        until=time.monotonic()+38
        while time.monotonic()<until:
            if result_file.exists():
                try:
                    value=json.loads(result_file.read_text(encoding='utf8'))
                    messages=[dict(state='runtime-metadata',pid=pid,value=value)];break
                except json.JSONDecodeError: pass
            if done.is_set(): break
            time.sleep(.1)
        if mode in ('auth','dispatchwatch'): messages.append(dict(state='sso-callback-statistics',value=script.exports_sync.ssostats()))
        if mode=='live' and messages and messages[-1].get('value',{}).get('state')=='auth-pipe-ready':
            env=os.environ.copy();env['QQ_FARM_PIPE']=pipe_name;env['QQ_FARM_PIPE_TOKEN']=pipe_token
            wasm=r'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_src/1112386029_3_3443f89042dffbf93d20ced1d652d031/tsdk/tsdk.wasm'
            probe=subprocess.run(['dotnet','tools/server-probe/bin/Release/net10.0-windows/server-probe.dll',wasm],env=env,capture_output=True,text=True,timeout=100)
            print(probe.stdout,flush=True)
            if probe.returncode: print('C# server probe exit: '+str(probe.returncode),flush=True)
finally:
    if session: session.detach()
    if result_file.exists(): result_file.unlink()
result=dict(mode=mode,pid=pid,qqStarted=False,farmStarted=False,diagnostics=messages)
Path('artifacts/existing-qq-'+(mode if mode!='metadata' else 'interface')+'-probe.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result),flush=True)
