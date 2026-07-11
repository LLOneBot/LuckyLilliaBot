# PMHQ 抓包工具

借用 PMHQ 暴露的 SSE 端点 (`http://localhost:13000/`) 抓 protobuf，配合 OneBot HTTP 端点 (`http://localhost:53000/`) 触发 API，反向得到未实现 API 的 OIDB 命令字。

## 用法

1. **保持 SSE 监听**（后台一直跑）：
   ```bash
   node devtools/sse-listener.mjs sse-capture.jsonl
   ```
   每条 send/recv 写一行到 `sse-capture.jsonl`：
   ```
   {"type":"send","data":{"echo":null,"seq":N,"cmd":"OidbSvcTrpcTcp.0xXXX_Y","pb":"<hex>"}}
   ```

2. **触发单次 OneBot 调用并抓配对包**：
   ```bash
   node devtools/trigger.mjs <onebot-endpoint> '<json-body>'
   # 例：
   node devtools/trigger.mjs get_profile_like '{"user_id":721011692,"start":0,"count":3}'
   ```
   输出 OneBot 响应 + 该次调用产生的全部 send/recv pb 配对。

3. **批量扫多个端点**：编辑 `devtools/sweep.mjs` 的 `targets` 数组后 `node devtools/sweep.mjs`。

## 注意

- 4000 端口不是 OneBot HTTP（只发心跳），53000 才是
- 当前账号正在 PMHQ 登录中。**不要启动我们自己的项目**，会重复登录冲突
