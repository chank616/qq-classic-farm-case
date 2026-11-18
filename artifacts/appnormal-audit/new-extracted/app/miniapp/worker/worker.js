/* eslint-disable */
!(function (e) {
  function r(n) {
    if (o[n]) return o[n].exports;
    const t = (o[n] = { i: n, l: !1, exports: {} });
    return e[n].call(t.exports, t, t.exports, r), (t.l = !0), t.exports;
  }
  var o = {};
  (r.m = e),
    (r.c = o),
    (r.d = function (e, o, n) {
      r.o(e, o) || Object.defineProperty(e, o, { enumerable: !0, get: n });
    }),
    (r.r = function (e) {
      'undefined' !== typeof Symbol &&
        Symbol.toStringTag &&
        Object.defineProperty(e, Symbol.toStringTag, { value: 'Module' }),
        Object.defineProperty(e, '__esModule', { value: !0 });
    }),
    (r.t = function (e, o) {
      if ((1 & o && (e = r(e)), 8 & o)) return e;
      if (4 & o && 'object' === typeof e && e && e.__esModule) return e;
      const n = Object.create(null);
      if ((r.r(n), Object.defineProperty(n, 'default', { enumerable: !0, value: e }), 2 & o && 'string' !== typeof e))
        for (const t in e) r.d(n, t, ((r) => e[r]).bind(null, t));
      return n;
    }),
    (r.n = function (e) {
      const o =
        e && e.__esModule
          ? function () {
              return e.default;
            }
          : function () {
              return e;
            };
      return r.d(o, 'a', o), o;
    }),
    (r.o = function (e, r) {
      return Object.prototype.hasOwnProperty.call(e, r);
    }),
    (r.p = ''),
    r((r.s = 221));
})({
  221() {
    const e = {};
    let r = 1;
    const o = 'run';
    const n = 'triggerOnMsg';
    const t = 'WeixinWorkerInvoke';

    (WeixinWorker.create = () => {
      const n = new Worker('/__static__/miniapp/worker/workerTpl.js');
      e[r] = n;
      n.onmessage = (e) => {
        if (e.data)
          switch (e.data.type) {
            case t:
              switch (e.data.method) {
                case 'postMsgToAppService':
                  e.data.arguments &&
                    e.data.arguments.length &&
                    WeixinWorker.workerMsgHandler &&
                    WeixinWorker.workerMsgHandler.apply(WeixinWorker, e.data.arguments);
                  break;
                case 'postMsgToWorker':
                  e.data.arguments &&
                    e.data.arguments.length &&
                    __WeixinWorker.postMsgToWorker.apply(__WeixinWorker, e.data.arguments);
              }
          }
      };

      // 1. 初始化 WeixinWorker
      n.postMessage({
        type: o,
        code:
          "\n  WeixinWorker = {}\n  WeixinWorker.create = scriptName => {\n    self.postMessage({\n      type: 'WeixinWorkerInvoke',\n      method: 'create',\n      arguments: [WeixinWorker.__workerId__, scriptName],\n    })\n  }\n  WeixinWorker.terminate = workerId => {\n    self.postMessage({\n      type: 'WeixinWorkerInvoke',\n      method: 'terminate',\n      arguments: [WeixinWorker.__workerId__, workerId],\n    })\n  }\n  WeixinWorker.postMsgToWorker = (workerId, msg) => {\n    self.postMessage({\n      type: 'WeixinWorkerInvoke',\n      method: 'postMsgToWorker',\n      arguments: [WeixinWorker.__workerId__, workerId, msg],\n    })\n  }\n  WeixinWorker.postMsgToAppService = msg => {\n    try {\n      self.postMessage({\n        type: 'WeixinWorkerInvoke',\n        method: 'postMsgToAppService',\n        arguments: [WeixinWorker.__workerId__, JSON.parse(msg)],\n      })\n    } catch (err) {\n      console.error('send msg to appservice error: ', err)\n    }\n  }\n" +
          `\nWeixinWorker.__workerId__ = ${r}`,
      });

      // 2. 注入worker环境标志全局变量（jsbridge中判断使用）
      n.postMessage({ type: o, code: `__IS_PCQQ_WORKER__ = true` });

      // 3. 初始化 __wxConfig
      n.postMessage({ type: o, code: `__wxConfig = ${JSON.stringify(__wxConfig)}` });

      if (!__workerVendors__ || !__workerVendorCode__) throw new Error('missing worker vendor code');

      // 4. 获取并执行 QWorker.js
      const workerVendorCode = window.electron.contentGetWorkerVendorCodeIPC();
      n.postMessage({ type: o, code: workerVendorCode });

      // 5. 执行业务 workers 代码
      if (!__business_workersCode__) return -1;
      n.postMessage({ type: o, code: __business_workersCode__ });

      return ++r - 1;
    }),
      (WeixinWorker.terminate = (r) => {
        const o = e[r];
        o && (o.terminate(), delete e[r]);
      }),
      (WeixinWorker.postMsgToWorker = (r, o) => {
        const t = e[r];
        if (t)
          try {
            t.postMessage({ type: n, msg: JSON.parse(o) });
          } catch (e) {
            console.error('post msg to worker err: [workerId] ', r, ' [msg] ', o);
          }
      });
  },
});
