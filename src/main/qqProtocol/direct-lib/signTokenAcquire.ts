// DEPRECATED: 12B sign-token 获取已整体下沉到 SignProxy 的 acquireSignToken (native 一把跑完
// esk -> relay -> sa -> relay -> finish + O3 report, relay 走 registerSignRuntime 注册的发包回调).
// 见 sign.ts::acquireSignToken / client.ts::tryAcquireSignToken. 本文件不再被引用, 保留仅作历史参考.
export {}
