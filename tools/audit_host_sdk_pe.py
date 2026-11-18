import hashlib
import json
import re
import sys
from pathlib import Path

import pefile

KEYWORDS = re.compile(r'login|session|code|token|auth|ams|cookie|expire|refresh|signature|request|openid|wx\.', re.I)
SDK_SYMBOLS = re.compile(r'GetLoginCode|GetLoginParams|LoginResult|OnBeginLogin|OnRequestLogin|OnWmpfLoginResult|OnLoginResult|GSCache|GetGameSession|wmpf_login|game session manager|Fetch game session too frequently|JSLogin(?:Request|Response|ConfirmRequest|ConfirmResponse)|JSRefreshSession(?:Request|Response)|GetRuntimeSession(?:Request|Response)|codeToSession|wx\.login|js_code|expireIn|\bneed_union_code\b|\bunion_code\b|\bdevice_code\b', re.I)


def strings(data: bytes, encoding: str, pattern: re.Pattern[str]) -> list[str]:
    if encoding == 'ascii':
        runs = re.findall(rb'[\x20-\x7e]{5,}', data)
        values = [run.decode('ascii', errors='ignore') for run in runs]
    else:
        text = data.decode('utf-16le', errors='ignore')
        values = re.findall(r'[\x20-\x7e\u4e00-\u9fff]{5,}', text)
    return sorted({value for value in values if pattern.search(value)})


def audit(path: Path) -> dict:
    data = path.read_bytes()
    pe = pefile.PE(data=data, fast_load=True)
    pe.parse_data_directories(directories=[
        pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_EXPORT'],
        pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_IMPORT'],
    ])
    exports = []
    if hasattr(pe, 'DIRECTORY_ENTRY_EXPORT'):
        exports = sorted({
            entry.name.decode('ascii', errors='replace') if entry.name else f'ordinal_{entry.ordinal}'
            for entry in pe.DIRECTORY_ENTRY_EXPORT.symbols
        })
    imports = {}
    for module in getattr(pe, 'DIRECTORY_ENTRY_IMPORT', []):
        names = sorted({
            entry.name.decode('ascii', errors='replace') if entry.name else f'ordinal_{entry.ordinal}'
            for entry in module.imports
        })
        interesting = [name for name in names if re.search(r'WSA|socket|connect|send|recv|Crypt|BCrypt|WinHttp|Internet|URL|HTTP', name, re.I)]
        imports[module.dll.decode('ascii', errors='replace')] = interesting
    ascii_matches = strings(data, 'ascii', SDK_SYMBOLS)
    wide_matches = strings(data, 'utf16le', SDK_SYMBOLS)
    ascii_keywords = strings(data, 'ascii', KEYWORDS)
    wide_keywords = strings(data, 'utf16le', KEYWORDS)
    return {
        'path': str(path),
        'size': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
        'peMachine': hex(pe.FILE_HEADER.Machine),
        'exports': exports,
        'imports': imports,
        'matchingAsciiSdkSymbols': ascii_matches,
        'matchingUtf16leSdkSymbols': wide_matches,
        'matchingAsciiLoginSessionKeywords': ascii_keywords,
        'matchingUtf16leLoginSessionKeywords': wide_keywords,
    }


paths = [Path(arg) for arg in sys.argv[1:]]
if not paths:
    raise SystemExit('Usage: py -3 tools/audit_host_sdk_pe.py <dll> [...]')
result = {'files': [audit(path) for path in paths]}
print(json.dumps(result, ensure_ascii=False, indent=2))
