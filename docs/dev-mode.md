# --dev 本地联调模式

`--dev` 让 Bot 连本地 manager-server 联调: 加载 dev 版 sign-proxy, auth token 改读 `data/auth_token.dev.txt`。
判定在 `src/common/utils/environment.ts` 的 `isDevMode()`, **只看命令行, 不读环境变量** —— 部署环境里
残留一个 `DEV` 之类的变量不能把它打开。

## 切换了什么

| 项 | 默认 | `--dev` |
|----|------|---------|
| sign-proxy .node | `sign-proxy.<triple>.node` | `sign-proxy-dev.<triple>.node` |
| 版本文件 | `sign-proxy.package.json` | `sign-proxy-dev.package.json` |
| tmpdir 缓存 | `lucky-lillia-sign-proxy/sign-proxy.<triple>.<version>.node` | `lucky-lillia-sign-proxy/sign-proxy-dev.<triple>.<version>.node` |
| manager 地址 | `https://api-auth.luckylillia.com` (china 接入点另一个 host, 看 `--cdn`) | `http://localhost:8090`, 编译期写死, 忽略 `--cdn` |
| TLS pinning | 开 | 关, 且不走系统代理 |
| auth token 文件 | `data/auth_token.txt` | `data/auth_token.dev.txt` |

- 文件选择在 `src/main/qqProtocol/direct-lib/sign-proxy/index.ts` (`baseName`)。两套名字完全不重叠,
  dev 文件缺失时直接加载失败 (报错末尾提示去跑 `build:dev-bot`), **不会退回 prod**。
- token 路径在 `src/main/config/index.ts` 的 `authTokenUtil`。token 文件监听、掉线重连、WebUI 录入
  (`src/webui/BE/routes/authToken.ts`) 都走它, 一起切换; "未配置 token" 的日志打印的是实际路径。

## 怎么跑

1. **SignProxy 仓库**: `npm run build:dev-bot` (= `build:dev` + `sync-to-bot --dev`)。它把
   `dist/sign-proxy-dev.*.node` 拷进 `src/main/qqProtocol/direct-lib/sign-proxy/`, 并 bump
   `sign-proxy-dev.package.json` 的版本号。只跑 `build:dev` 不会同步到 Bot。
2. **本地 manager-server 监听 8090**: `crates/manager-server/.env` 里 `APP__BIND=0.0.0.0:8090`。
   ManagerServer 的 `.env.example` / README 写的是 8080, 照抄的话 dev 版连不上。
3. **dev token**: 在本地 manager 生成, 写进 `data/auth_token.dev.txt`; 或者 `--dev` 启动后在 WebUI 录入,
   写的也是这个文件。
4. **启动**: `npm run dev -- --dev` (即 `tsx watch src/main/main.ts --dev`, 可以跟 `-q <uin>` / `--protocol`
   一起用)。`.vscode/launch.json` 里的配置没带 `--dev`, 要用得自己加进 `args`。

## 怎么确认生效

- sign 初始化时日志会出现 `[Sign/warn] [DEV] base_url=http://localhost:8090, TLS pinning OFF -- 非生产构建, 切勿发布`
  (SDK dev feature 打的 warn, 经 `sign.ts` 的 `defaultLogger` 转出来)。没有这条就是 prod 版。
- 看进程实际加载的 .node (Windows PowerShell):
  `(Get-Process -Id <pid>).Modules | ? ModuleName -like 'sign-proxy*' | % FileName`。
  路径里应是 `sign-proxy-dev.<triple>.<version>.node`, 版本号跟 `sign-proxy-dev.package.json` 一致。

## 坑

- **换了 .node 没生效**: loader 不直接加载 vendored 目录里的文件, 而是先拷到
  `tmpdir()/lucky-lillia-sign-proxy/` 再加载 (运行中 .node 会被锁, 这样 vendored 文件才能随时覆盖)。
  缓存按文件名命中, **已存在就不再复制** —— 只换 .node 不改版本号, 加载的还是旧缓存。
  `sync-to-bot` 每次都会 bump 对应的 `*.package.json`; 手动拷 .node 要自己改版本号。
  版本文件读不到时版本回退 `0.0.0`, 一样会命中旧缓存。
- **只有 Windows / linux-glibc host 上的 `build:dev` 会产出 `-dev` 名字**: macOS、linux-musl host 上 napi
  直接出 `sign-proxy.<triple>.node`, SignProxy 的 `scripts/postbuild-rename.mjs` 不改名 (见其文件头注释)。
  结果是 dev 构建顶替了 SignProxy `dist/` 里的同名 prod 文件: `sync-to-bot --dev` 找不到文件报错,
  之后跑普通 `sync-to-bot` 还会把这个 dev 版当 prod 同步进 Bot。
- **`AUTH_TOKEN` 环境变量兜底仍然生效**: `auth_token.dev.txt` 为空时会退回 `AUTH_TOKEN`
  (`authTokenWatcher.ts` / `direct.ts`)。这个变量里如果是线上 token, 会被发给本地 manager。
- **日志 / WebUI 里"获取 Auth Token"的链接仍指向线上站点** (`getAuthTokenPageUrl()` 不看 `--dev`),
  dev token 要去本地 manager 拿。

## 防止 dev 构建混进发布包

- `.gitignore` 忽略 `sign-proxy/sign-proxy-dev.*`: dev 构建不会被提交, CI 从仓库构建也就拿不到它。
- `vite.config.ts` 只把 `sign-proxy.*.node` 和 `sign-proxy.package.json` 拷进 `dist/`。下游全都从 `dist/`
  取文件: `docker/Dockerfile.local` / `Dockerfile.test`、`publish.yml` 打的各平台包、`script/npm-publish-dist.bat`
  (本地直接把 dist 发 npm)。它们删多余平台 .node 用的都是 `sign-proxy.*.node` 通配, 匹配不到 `sign-proxy-dev.*`,
  **所以隔离只能守在 vite 这一层**, 别把那个 glob 改回 `*.node`。
