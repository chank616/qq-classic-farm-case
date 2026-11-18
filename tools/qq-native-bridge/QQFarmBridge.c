// Short-lived bootstrap for the already-running QQ JavaScript environment.
// No QQ launch, login initialization, farm host, or game runtime is involved.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdint.h>
#include "MinHook.h"

typedef int (__cdecl *GET_INFO)(void*,void*,size_t*,void**,void**,void**);
typedef int (__cdecl *MAKE_STRING)(void*,const char*,size_t,void**);
typedef int (__cdecl *RUN_SCRIPT)(void*,void*,void**);
typedef int (__cdecl *CLEAR_EXCEPTION)(void*,void**);
typedef struct { volatile LONG status; uint32_t bytes; char script[1]; } INSTALL_REQUEST;
static GET_INFO original;
static MAKE_STRING make_string;
static RUN_SCRIPT run_script;
static CLEAR_EXCEPTION clear_exception;
static volatile LONG installing,claimed,finished,active;
static int script_status;
static INSTALL_REQUEST *request;
static char *script;
static void *target;

static int __cdecl on_info(void *env,void *info,size_t *count,void **args,void **self,void **data)
{
    InterlockedIncrement(&active);
    int result=original(env,info,count,args,self,data);
    if(result==0&&InterlockedCompareExchange(&claimed,1,0)==0){
        void *code=0,*value=0;
        script_status=make_string(env,script,request->bytes,&code);
        if(script_status==0)script_status=run_script(env,code,&value);
        if(script_status!=0)clear_exception(env,&value);
        InterlockedExchange(&finished,1);
    }
    InterlockedDecrement(&active);
    return result;
}

__declspec(dllexport) DWORD WINAPI FarmBridgeInstall(void *input)
{
    INSTALL_REQUEST *r=(INSTALL_REQUEST*)input;
    if(!r||r->bytes==0||r->bytes>262144)return 1;
    if(InterlockedCompareExchange(&installing,1,0)!=0){InterlockedExchange(&r->status,101);return 2;}
    LONG final_status=102;BOOL initialized=FALSE,created=FALSE,enabled=FALSE;
    request=r;claimed=0;finished=0;active=0;script_status=-1;
    script=(char*)HeapAlloc(GetProcessHeap(),0,(SIZE_T)r->bytes+1);
    if(!script)goto cleanup;
    CopyMemory(script,r->script,r->bytes);script[r->bytes]=0;
    HMODULE qq=GetModuleHandleW(L"QQNT.dll");if(!qq)goto cleanup;
    target=(void*)GetProcAddress(qq,"napi_get_cb_info");
    make_string=(MAKE_STRING)GetProcAddress(qq,"napi_create_string_utf8");
    run_script=(RUN_SCRIPT)GetProcAddress(qq,"napi_run_script");
    clear_exception=(CLEAR_EXCEPTION)GetProcAddress(qq,"napi_get_and_clear_last_exception");
    if(!target||!make_string||!run_script||!clear_exception)goto cleanup;
    if(MH_Initialize()!=MH_OK)goto cleanup;initialized=TRUE;
    if(MH_CreateHook(target,on_info,(void**)&original)!=MH_OK)goto cleanup;created=TRUE;
    if(MH_EnableHook(target)!=MH_OK)goto cleanup;enabled=TRUE;
    InterlockedExchange(&r->status,1);
    ULONGLONG deadline=GetTickCount64()+30000;
    while(!finished&&GetTickCount64()<deadline)Sleep(10);
    final_status=finished?(script_status==0?2:103):104;
cleanup:
    if(enabled)MH_DisableHook(target);
    // Disabling prevents new calls. Existing callbacks must leave before the
    // trampoline is removed or the request's memory can be released.
    while(InterlockedCompareExchange(&active,0,0)!=0)Sleep(1);
    if(created)MH_RemoveHook(target);
    if(initialized)MH_Uninitialize();
    if(script){SecureZeroMemory(script,(SIZE_T)r->bytes+1);HeapFree(GetProcessHeap(),0,script);script=0;}
    request=0;InterlockedExchange(&installing,0);InterlockedExchange(&r->status,final_status);
    return final_status==2?0:3;
}

BOOL WINAPI DllMain(HINSTANCE instance,DWORD reason,LPVOID reserved)
{
    if(reason==DLL_PROCESS_ATTACH)DisableThreadLibraryCalls(instance);
    return TRUE;
}
