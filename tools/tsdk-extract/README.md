# TSDK 抽取实验结果

- `build_browser_bundle.js`：从 `game.js` 抽出 31 个 babel + tsdk 模块，生成自包含 `tsdk-browser.js`。
- `host.js`：Node 宿主（AMD loader + wx stub + WXWebAssembly shim）。
- `probe_browser.js`：无头 Chrome 宿主（本地 HTTP + CDP）。

**实测结论**：`tsdk.wasm` 使用腾讯 mergewasm 定制格式，标准 WebAssembly 在 ctors 阶段报
`table index is out of bounds`（Node 与 Chrome 一致）。手动调用
`__mergewasm_shared__decrypt_data_section` / `__mergewasm_shared____wasm_decrypt_strings`
后仍然失败。TSDK 只能在微信/QQ 小程序运行时内运行。

复现：
```
node tools/tsdk-extract/build_browser_bundle.js <versionDir>/game.js tools/tsdk-extract/tsdk-browser.js
node tools/tsdk-extract/host.js <versionDir>/game.js <versionDir>/tsdk/tsdk.wasm --selftest
node tools/tsdk-extract/probe_browser.js <versionDir>
```
