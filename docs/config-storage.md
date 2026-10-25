# 配置存储标准

> **2026-10-24 改为实例模型**(参考 Koishi 的多实例):配置按实例名分目录存放,默认实例 `default`;去掉账号覆盖层;所有插件(包括 OneBot / Satori / Milky / 邮件通知)的配置统一存在当前实例的 `plugins.json`,只经插件服务读写。
>
> 已实施(I1–I3,见 §10 的实施记录)。原先"实例级 / 账号级"两层方案里的 `config/global` + `config/accounts/<uin>` 布局、账号覆盖层、内置插件的配置绑定都已拆掉(文末附录是那一期的记录)。插件系统和这些目录都没发布过,所以只需要迁移旧版 bot 的 `config_<uin>.json` / `email_config.json` / `webui_token.txt`(§9)。跨仓库的桌面端 / docker 改动还没做(§10 清单)。相关:[plugin-system.md](plugin-system.md)、[core-pluginization.md](core-pluginization.md)。

## 1. 为什么改成实例

- **两层方案解决不了同目录多号同时运行的冲突**。真正冲突的只有一个进程独占的资源:本机监听端口(OneBot 正向 ws / http、Satori、Milky HTTP、WebUI)。新号无论从默认值还是从全局层继承,端口都一样,所以冲突和"存全局还是按账号"无关。
- **配置随登录切换带来一串复杂度**:登录时切换账号文件、`-q` 预读、`peek(uin)` 预判 WebUI 端口、`account/prepare` 重算覆盖层、登录前适配器设置页只能报 503。
- **存法有两套**:第三方插件在 `plugins.json`,内置插件的配置经绑定写在 bot 自己的文件里,开关藏在值里。

实例模型:**一个实例 = 一套完整环境**(bot 设置 + 插件条目与配置 + 插件数据 + WebUI 密码),同一时间只被一个进程使用。同时跑多个号 = 同时跑多个实例;换号 = 继续用同一个实例,配置沿用。实例在启动时选定,登录不切换配置。

## 2. 原则

1. **实例是配置唯一的隔离单位**,实例内不再按账号拆配置。同一个实例里要按号做不同的事,由插件自己按 selfId 过滤(以后可以给一个通用写法,类似 Koishi 的过滤器)。
2. **一个实例只有一个插件配置文件**,第三方插件和内置插件一样存、一样读写、一样开关。读写只经插件服务:WebUI、OneBot `set_config`、桌面端(bot 运行时走 HTTP 接口)。
3. **配置在启动时确定**:登录前就能读写全部配置,登录不切换配置。
4. **属于 QQ 号或设备的数据 / 凭证不进实例**:`qq-session-*`、`database/<uin>.v3.db`、`auth_token*.txt`、设备身份留在原位置,不属于某一套配置。
5. **新东西只在运行时创建,且只在 `data/` 下**,发布物顶层永不出现 `data/`。
6. **外部程序的旧路径靠启动迁移兜底**,同期升级它们(§10 跨仓库清单)。

## 3. 目录布局

```
<llbot.js 所在目录 = cwd>/
├─ default_config.json                  模板:新建实例时 bot 设置和内置插件配置的初始值;docker/nix 照旧 sed 它
└─ data/
   ├─ instances/<实例名>/                 一个实例 = 一套完整环境
   │  ├─ settings.json                  bot 自身设置:log / logLevel / ffmpeg / msgCacheExpire / musicCardSignUrl / enableLocalFile2Url / webui ...
   │  ├─ plugins.json                   全部插件的条目和配置(含 builtin:onebot11 / satori / milky / email-notification)
   │  ├─ webui_token.txt                这个实例的 WebUI 密码
   │  └─ plugin-data/<key>/shared/      插件数据:ctx.storage.dir(),也是条目的 ctx.baseUrl
   │     plugin-data/<key>/<uin>/       ctx.storage.dir('account')
   ├─ plugins/                          插件代码,所有实例共用,运行时只读
   ├─ state/                            bot 私有、不要手改:实例锁 instances/<实例名>.lock、文件写锁
   ├─ database/<uin>.v3.db              [QQ 号] 不动
   ├─ qq-session-<uin>[-<p>].json       [QQ 号 x 协议] 不动
   ├─ auth_token[.dev].txt  machine_guid.bin  macos_device.json   [设备] 不动
   ├─ logs/  temp/  packets/            所有实例共用;日志文件名带 pid
   └─ *.bak                             迁移后保留的旧文件
```

- 实例名:`[A-Za-z0-9][A-Za-z0-9_-]{0,63}`,QQ 号也是合法实例名,原样作为目录名。
- 插件数据跟实例走:两个实例启用同一个插件,数据互不相干。`<key>`:第三方插件用包名把 `/` 换成 `+`;内置条目用 `_builtin+<名字>`(冒号在 Windows 路径里非法,`_` 开头不会撞真实包名)。`dir('account')` 要求调用链上 inject 了 `account`;卸载插件不删数据。按 QQ 号的结构化数据继续用 `ctx.database`。

## 4. 选实例与实例锁

- 启动参数 `--instance <名字>`(也支持 `--instance=<名字>`)或环境变量 `LLBOT_INSTANCE`。都没给时:
  - 带了 `-q <uin>` 且存在实例 `<uin>` → 用它。这是给旧版多号迁移出来的实例用的:按 `-q` 启动的桌面端 / docker 不改参数就进到对的实例;
  - 否则用 `default`。

  启动日志写明用的是哪个实例、为什么。
- 实例不存在就新建:`settings.json` 和内置插件条目的初始配置都取自 `default_config.json`。
- **实例锁**:进程启动时在 `state/instances/<实例名>.lock` 记下 pid + host,退出时删除。
  - 锁被同一台机器上的活进程持有 → 拒绝启动,提示"实例 X 已在 pid N 运行,用 `--instance` 指定其他实例";
  - 持有者已经退出(同一台机器)→ 接管;
  - 不是同一台机器 → 保守拒绝(一个 `data/` 只能单机使用,见 §8)。

  同一个实例的端口因此不会被两个进程抢。
- 不同实例之间撞端口:适配器 / WebUI 监听失败时报清楚端口和原因,由用户给其中一个实例换端口。
- 登录的号有同名实例、但当前用的不是它时,登录后打一条提示(想用那份配置要 `--instance <uin>` 启动)。不在登录时切换实例。
- 暂不做:账号锁(同一个号同时登录两个实例,QQ 会踢掉一个)。

## 5. 插件配置

```jsonc
// data/instances/<实例名>/plugins.json
{ "version": 1, "entries": [
  { "id": "7f3a9c21", "name": "luckylillia-plugin-keyword-reply", "config": { "rules": [] } },
  { "id": "1c0e5b7a", "name": "builtin:onebot11", "config": { "connect": [] } },
  { "id": "9a41d2e3", "name": "builtin:satori", "disabled": true }
] }
```

- **只有一层**:生效值 = schema 默认值 + 条目的 `config`。落盘只存相对 schema 默认值的差异,差异由服务端算,`PUT` 收完整值。合并和差异沿用已实施的 schema 感知规则:只有 `object` 逐 key 递归,`dict` / `array` / `union` / 标量整体替换。
- **开关一律是条目的 `disabled`**,内置插件也一样。`ob11.enable` / `satori.enable` / `milky.enable` / 邮件的 `enabled` 不再存在,迁移时转成 `disabled`。
- **校验**:schema + 插件声明的跨字段规则(`check`,例如"监听全部地址必须设 token")。保存时总是校验;启用时也校验,邮件通知除外(SMTP 没配好也能先打开,只是发不出去)。邮件的 `check` 拿得到条目是否启用:启用着才要求 SMTP / 发件人 / 收件人齐全,停用时可以存空配置(issue #690)。
- **密码类字段**:由内置插件显式声明(`BuiltinConfig.secrets`),读取时返回掩码,写回掩码或空串就保留原值,请求带 `clear` 才清空。目前只有邮件密码:适配器的 token 在 schema 里也标了 `role('secret')`,但设置页本来就要显示 token,所以没有按 role 自动打码。第三方插件按 role 打码留作后续。
- **并发**:rev / 409 照旧;写入走 JsonFile 的原子写 + 跨进程锁。实例锁保证同一时间只有一个 bot 进程在用这个文件;桌面端在 bot 运行时走 HTTP 接口,不直接写文件。bot 没运行时外部改的文件,启动时读取并校验;运行中外部改动会被监听到并重新加载。
- **删掉的**:账号覆盖层 `accounts/<uin>/plugins.json`、WebUI 的作用域页签、写入路由、清单字段 `llbot.configScope`、`account/prepare` 里的覆盖重算。

## 6. 内置插件

- OneBot / Satori / Milky / 邮件通知的配置放进各自的条目(`builtin:onebot11` 等),schema 就是已有的 `OB11Schema` / `SatoriSchema` / `MilkySchema` / `EmailSchema` 去掉开关字段。`BuiltinConfigBinding` 整套删除:配置写在 bot 自己文件里、开关藏在值里、`status.bound`、`validateOnEnable`。
- 适配器拿到的配置 = 条目配置 + bot 设置里它要用的字段(`ffmpeg`、`musicCardSignUrl`、`enableLocalFile2Url`),由 `adapterEntry` 拼。条目配置变了走 cordis 的 `fiber.update` 重启这个适配器,别的插件或 bot 设置保存不影响它;bot 设置里那几个字段变了,只更新调用时才读的字段(同 `c43abebe`)。
- 新建实例或某个内置条目第一次出现时,初始配置取 `default_config.json` 的 `ob11` / `satori` / `milky` 段。nix 用 sed 把 host 改成 `""` 就是靠这个生效的。
- OneBot `get_config` / `set_config` 对外字段形状不变:`get_config` 返回 bot 设置加上 `ob11` / `satori` / `milky`(各自的 `enable` = 条目没停用);`set_config` 把 bot 设置字段交给 ConfigService,三个适配器段交给插件服务(`enable` 转成启用 / 停用),同样校验。
- 前端各设置页照旧用 `useBuiltinConfig` 走插件接口。

## 7. bot 设置(`settings.json`)

- 一个文件,不再拆实例级 / 账号级,也不含适配器配置。`ConfigService` 启动时就绑定当前实例的文件,登录不切换;删掉 `-q` 预读、`peek(uin)`、`accountFile`。
- 生效顺序(后覆盖前):代码默认值 < `default_config.json`(只在新建实例时用)< `settings.json` < 环境变量(`LLBOT_WEBUI_HOST/PORT`、`LLBOT_LOG_LEVEL`)< argv。环境变量只进内存、不落盘(已实施)。
- `/api/login-info` 不再需要预判"登录后 WebUI 会去哪":登录前后 WebUI 配置相同。

## 8. JsonFile 原语 + 并发

所有 JSON 文件统一用 `JsonFile<T>`(已实施):

- **读**:JSON5 解析;失败时保留上一份有效值,不广播,下次轮询重试(不再"读坏了就广播默认值",也不再把坏文件改名)。
- **写**:先写 `<file>.<pid>.<rand>.tmp` 再 rename;Windows 下 rename 失败回退直接写。
- **识别自己的写入**:记内容哈希。
- **监听**:`fs.watchFile` 1 秒轮询 + 300ms 尾随防抖(docker 下 inotify 不可靠才用轮询)。
- **共享文件**:`update(mutator)` 在 `state/<file>.lock` 锁内"重读、重放这次操作、原子写"。锁记 pid **加 host / boot id**:docker 多容器 bind-mount 同一个卷时 pid 会在各自的命名空间里相撞,只对同一台机器判断存活,不同机器保守等待。**一个 `data/` 只能单机使用。**

## 9. 迁移(启动时一次性)

在 `data/instances/` 不存在时运行。来源:

- 已发布的旧版:`config_<uin>.json`(每个号一份完整配置)、`email_config.json`、`webui_token.txt`。
- 本分支没发布过的中间布局(只有开发机上有):`config/global/{settings,email,plugins}.json`、`config/accounts/<uin>/{settings,plugins}.json`、`plugin-data/`。每个号的完整配置 = global 的 settings + 这个号的 account settings。

步骤:

1. 收集每个号的完整配置,按文件修改时间判断最近用过的是哪个号。
2. 最近用过的号 → 实例 `default`。其余每个号:完整配置(补齐默认值后)和 `default` 不同 → 建实例 `<uin>`;相同 → 不建,它以后用 `default`。
3. 每个建出来的实例:
   - `settings.json` = 这个号的配置去掉 `ob11` / `satori` / `milky`;
   - `plugins.json`:内置条目的配置取 `ob11` / `satori` / `milky` 段,`enable: false` 转成 `disabled: true`;邮件条目取 `email_config.json`(或 `config/global/email.json`);第三方插件条目复制 `config/global/plugins.json` 里的(原来是全局一份、所有号共用);
   - `webui_token.txt` 复制一份,之后各实例各管各的。
4. 中间布局的 `plugin-data/` 整个搬进 `default`;账号覆盖层 `config/accounts/<uin>/plugins.json` 丢弃并告警。
5. 旧文件改名 `.bak`,中间布局的 `config/` 目录改名 `config.bak/`。日志列出建了哪些实例,并对每个 `<uin>` 实例提示"QQ <uin> 的配置在实例 <uin>,用 `-q <uin>` 或 `--instance <uin>` 启动"。
6. 幂等:`instances/` 已存在就不再导入。之后又出现的 `config_<uin>.json` / `email_config.json`(没升级的桌面端写的)只告警,内容不生效。

## 10. 实施步骤

| 步 | 内容 |
|---|---|
| I1 实例基础 | `--instance` / `LLBOT_INSTANCE` / `-q` 回落 + 名字校验;`INSTANCE_NAME` / `INSTANCE_DIR`;实例锁;`ConfigService` 改成单个 `instances/<实例名>/settings.json`(删 `-q` 预读、`peek`、登录时切换);WebUI 密码按实例;`plugins.json` / `plugin-data` 移进实例;§9 迁移。这一步内置适配器的配置仍在 `settings.json` 里,邮件在实例下的 `email.json` |
| I2 删账号覆盖层 | PluginService 的覆盖层 / 作用域 / 写入路由 / `configScope`;describe / PUT 去掉 `scope`;前端作用域页签;SDK 类型和 plugin-authoring 文档 |
| I3 内置插件进 `plugins.json` | 四个条目带配置、开关统一为 `disabled`、删 `BuiltinConfigBinding`;通用 secret 打码;`withBotConfig` 拼 bot 设置;OneBot `get_config` / `set_config` 兼容;迁移补一段:实例 `settings.json` 里的 `ob11` / `satori` / `milky` 和实例下的 `email.json` 搬进条目(也覆盖 I1 之后开发机上的数据) |
| I4 文档 | plugin-system.md、plugin-authoring.md、根 CLAUDE.md 索引;不登录 e2e 方法改成预置 `instances/default/` |

**跨仓库清单**(和这个分支一起发布,否则旧桌面端的配置页和一键对接会失效):

- 桌面端 `LuckyLillia.Desktop.Avalonia`:
  - `webui_token.txt` 路径(`LLBotConfigViewModel.cs:336`)→ `instances/<实例名>/`;
  - LLBot 配置页(`LLBotConfigViewModel.cs:331`)、一键对接(`IntegrationWizardViewModel.cs` 4 处)、OpenClaw(`OpenClawInstallService.cs:442`)/ RedReply(`RedReplyInstallService.cs:154`)的端口探测、邮件(`EmailService.cs:30`)→ bot 运行时走 WebUI 插件接口,没运行时读写 `instances/<实例名>/plugins.json` 里的内置条目;
  - 以后要多开,再加实例管理(启动时传 `--instance`)。
- docker:`startup.sh` sed `default_config.json` 照旧有效(新建实例从它取值);`install-llbot-docker.sh` 生成的 `config_<uin>.json` 首次启动靠迁移导入,后续改成直接写 `instances/default/`。
- nix:sed `default_config.json` 照旧有效。
- 文档站:讲配置文件位置的页面。

**实施记录**:

| commit | 步 | 落地内容 |
|---|---|---|
| `e18fcff1` | I1 | `--instance` / `LLBOT_INSTANCE` / `-q` 回落(`src/common/instance.ts`);`configPaths` 按当前实例算路径,第一次用到时才定实例(迁移之后);实例锁 `src/main/instanceLock.ts`:Windows 命名管道(按 data 目录区分)、其他系统 unix socket(优先 `state/instances/`,路径过长或文件系统不支持时退到临时目录),进程怎么死都会释放,`state/instances/<实例>.json` 只给提示用;`ConfigService` 单文件、启动即绑定、删 `-q` 预读 / `peek` / `accountFile`,配置文件从启动起就监听;WebUI 密码按实例(`webuiTokenUtil` 用到时才取路径);`/api/config` 带 `instance`,"其他配置"页说明改成按实例;迁移 `src/main/config/migrate.ts` 先建在 `instances.migrating/` 再整体改名,`.bak` 已存在时编号不覆盖,同一个号以中间布局为准。用本机开发数据的副本验证过:10 个号迁成 `default` + 4 个按号命名的实例,差异都是真实配置不同(端口、过滤器、反向地址);`-q` 进到同名实例、同实例第二个进程被拒(退出码 1)、两个实例并行、强杀后立即能重启 |
| `35e9b8ba` | I2 | 删账号覆盖层:`PluginOverlayStore` / `account/prepare` / 写入路由 / `updateConfig` 与 `PUT` 的 `scope` / `llbot.configScope` / 配置弹窗的作用域页签;`describe` 只剩 `config`(存下的差异)、`effective`、`rev`。覆盖层测试里和单层无关的 rev / 409 用例挪进 `configWrite.test.ts` |
| `d7af39e9` | I3 | 内置插件进 `plugins.json`:`BuiltinConfigBinding` 换成 `BuiltinConfig`(`check(value, enabled)` / `checkOnEnable` / `normalize` / `secrets` / `initial()`),schema 用插件自己的 `Config`(去掉 `enable` / `enabled`),开关一律是条目的 `disabled`、关掉就卸载;`adapterEntry()` 把条目配置 + `enable: true` + 适配器要读的 bot 设置交给适配器,条目配置变了重启,bot 设置变了只就地更新调用时才读的字段(OB11 / Satori / Milky 里按片段重建的逻辑删掉);`Config` 类型去掉三段,旧形状叫 `LegacyConfig`,由 `legacyConfig.ts` 给 `get_config` / `set_config` / `POST /api/config` 拼回和拆开(`set_config` 不带 token 规则、回复后才应用);启动时 `liftBuiltinSettings()` 把实例 `settings.json` 的三段和 `email.json` 搬进条目;邮件的 `EmailConfigStore` / `email-config-updated` 删除;启动时先等日志插件装好再迁移(之前迁移日志会丢,`ca273bc4` 起就是这样)。从旧版布局到条目、浏览器里三个设置页的读写、token 规则、旧形状接口都端到端验证过 |

## 11. Owner 决策

2026-10-24:

1. 配置按实例名区分,默认实例 `default`(参考 Koishi 多实例)。
2. 去掉账号差异层。
3. 插件代码共用(`data/plugins/`),插件数据跟实例走。
4. WebUI 密码跟实例走。
5. 旧版多号迁移:配置不同的号自动建以 QQ 号命名的实例。
6. 随方案一起执行(owner 没有单独表态,按建议做):内置插件的配置也进 `plugins.json`、开关统一成插件开关;OneBot `get_config` / `set_config` 对外形状不变;`get_config` 不打码。

沿用:配置里暂不支持用环境变量引用 secret,明文存储、不写日志。

## 12. 风险 / 未验证

- 迁移按"补齐默认值后任何字段不同"判定要不要给一个号单独建实例,日志开关这类小差异也会建,可能比用户预期多。日志会写明,多出来的实例可以直接删目录。
- `-q <uin>` 回落到同名实例,对手动建了 QQ 号命名实例的用户同样生效(符合预期)。
- OneBot `set_config` 现在先回复、再应用(避免重启自己时把回复卡住),紧接着的 `get_config` 可能还读到旧值;它也不再把监听者的异常带回给调用方,只记日志。
- Rust 移植版是否也按白名单删 key 待确认;它不和 TS bot 并发共享同一个 `data/`。
- `JsonFile` 用内容哈希识别自己的写入:外部写入恰好产生相同内容时会被当成自己写的而跳过(概率低)。

## 附:两层方案时期的实施记录

下表是改成实例模型之前已经落地的提交。JsonFile、schema 感知 diff、rev/409、env 层、日志按 pid、`webui_token.txt` 按 mtime 重读等继续有效;覆盖层(`f4450175` / `2a1afbd8` / `8d9a8bcf`)、内置插件配置绑定(`40203fe5` 起)、`config/global` + `config/accounts` 布局(`ca273bc4`)按 §10 拆掉或替换。

| commit | 阶段 | 落地内容 |
|---|---|---|
| `deb27ac9` | C0.1+C0.2 | `src/common/jsonFile.ts`:JSON5 读 / JSON 写、tmp+rename+Windows 回退、坏文件保留原地返 last-good、`update()` 跨进程锁(pid+host,只偷同 host 死进程)、`wasSelfWrite`/`isSelfWriteOnDisk` 内容哈希;`PluginStore` 迁过去。顺带堵掉"坏文件被 reconcile-save 覆盖"(init 的 save 加 `&& !error`)。后续为 ConfigService 补了 `readSync`/`writeSync`/`rawSync`(`get()` 是同步 API) |
| `28c1fcd7` | C1.1 | schema 模型与 diff 移到 `src/common/schema/{model,diff}.ts`,**改成 schema 感知**:只有 `object`(及对象 intersect)逐 key 递归,dict/array/union/标量整体替换(修 dict 被误逐 key 合并);node 为 null 时保留值驱动递归给 JSON 兜底编辑器。前端经新增 `@shared` 别名(vite + FE tsconfig + 根 vitest)re-export |
| `038a90bc` | C1.2 | `GLOBAL_PLUGINS_FILE` = `data/config/global/plugins.json`、`accountPluginsFile(uin)`;启动时自动把旧 `data/plugins.json` 迁进去 |
| `bb2b70ed` | C1.3 | 服务端拥有 diff:`updateConfig` 先把入参补成生效值(**兼容收完整值或已剥默认值的差异**)、校验合并后的生效值、再只存差异;`describe` 返回 `effective` |
| `f4450175` | C1.4 | `account/prepare(uin)` 事件(在 `reflect.notify(['account'])` 前);PluginService 监听后加载覆盖层并重算;`disabled(e,u)`;**无覆盖时交给 cordis 的仍是全局层差异,单账号路径零变化**;写入按生效值来源的层路由;坏覆盖只告警不阻断;覆盖文件自清理已删 id |
| `2a1afbd8` | C1.5 | `describe` 加 `global/account/scope/rev/uin/accounts`;`PUT` 收 `{config,scope,ifRev}`,rev 不一致返 **409**(在条目锁内比对);前端改发完整值、作用域页签(仅"账号≥2 或本账号已有覆盖"时出现)、409 重新载入 |
| `f2156409` | Cut 2a | ConfigService 走 JsonFile;**删掉白名单 `cleanupConfig`**(它按 `defaultConfig.ts` 重建配置,把只存在于 `default_config.json` 的 `logLevel` 永久吃掉);`logLevel` 补进 TS 默认值 + 单测锁两份默认值一致;坏 JSON 保留 last-good 不再广播 default、不覆盖文件;自写识别改内容哈希(旧 `skipNextWatch` 会吞掉紧随其后的外部编辑) |
| `18013fd8` | Cut 2b | `patch()`(对象逐 key、数组/标量整体替换)——**`set_config` 原来是整份覆盖,OB11 客户端只传一个字段就会清掉其余配置**;`POST /api/config` 与 `set_config` 都改用它;`LLBOT_WEBUI_HOST/PORT`、`LLBOT_LOG_LEVEL` 进内存不落盘(写盘前还原磁盘原值,避免同一次保存把 env 值固化)、`envLockedPaths()` 供 WebUI 置只读;`packetDump` 的 `resolve('data')` 归 `DATA_DIR` |
| `8d9a8bcf` | §5 补漏 | 写入路由最后一级兜底改看清单 `llbot.configScope`(两层都没配置过时生效),原来写死 `global`;同步 plugin-system / plugin-authoring 文档 |
| `b450b67e` | env 层修正 | 上一刀的三个洞:① `patch()` 能在**内存**里盖掉 env 锁定字段(磁盘没事,但 WebUI 会跟着重启到请求给的端口)→ 新增 `preview()` 先从 partial 剔掉锁定路径,`set()` 后再把锁定字段钉回 env 值;② 登录前没有账号文件时直接返回默认值、没叠 env(首次登录建文件那支同样漏了)→ env 是进程级的,登录前就生效;③ 重载补齐缺省写回时走了 `stripEnv`,用的是**上一次**加载记下的磁盘原值,外部刚改过的锁定字段会被写回旧值 → 写回的是磁盘真值,直接写。另加 `envLocks()`(带变量名)和无副作用的 `peek(uin)` |
| `4da064a9` | 1a 收尾 | `POST /api/config` 原来校验浅合并 `{...get(), ...config}` 而落盘是深合并:`{satori:{enable:true}}` 被误拒、`{satori:{token:''}}` 漏放 → 改为校验 `preview()` 的结果、只查本次请求涉及的片段;token 规则拆到 `src/main/config/validate.ts`(按片段,给内置插件绑定复用);`GET /api/config` 返回 `envLocked`;`/api/login-info` 改用 `peek()`,带 `LLBOT_WEBUI_PORT` 时不再让前端跳到死地址 |
| `484a01db` | 顺带修 | `PluginService.mount()` 用 `this.ctx.plugin()`,而经 `ctx.plugins` 调进来时 `this.ctx` 是**调用方**的 ctx:WebUI 启用的条目挂到了 PluginRoutes 的 fiber 下,PluginRoutes 一卸载条目就被静默拆掉(仍显示启用)。改为构造时存下自己的 ctx(`home`)挂载。注:经代理对字段**重新赋值**会正确落到实例上(测试验证过),只有 `ctx` 被替换 |
| `c43abebe` | 1b | OB11 / Milky 原来收到任何 `llob/config-updated` 都整体重建(踢掉所有 OneBot ws 客户端、反向 ws 重连、Milky SSE/WS 断开)→ 按自己片段深比较(文件 watcher 给的是全新对象树,不能比引用);OB11 只看 `{enable, connect}`,`musicSignUrl` 等调用时才读的字段直接赋值;重建串行化,dispose 等进行中的重建;Milky 只在 `enable/http/webhook` 变时重启 |
| `cf0f7190` | 1b | 前端各设置页只提交自己的片段(OneBot `{ob11}`、Satori `{satori}`、Milky `{milky}`、其他配置只交它编辑的键)——原来每页都 POST App 启动时加载的整份配置,会把别处(`set_config`、别的页、手改)刚改的片段冲回旧值;"其他配置"页 env 锁定字段只读并注明变量名、标注"每个账号各存一份";修端口回调把空 host(监听全部,docker 需要)改写成 `127.0.0.1` 的 bug。真实后端端到端验证过 |
| `b45d7686` | §6 | `ctx.storage.dir(scope)` + 条目的 `ctx.baseUrl`:`data/plugin-data/<key>/shared/` 与 `/<uin>/`;`storage` 是根上的 accessor(按 `symbols.shadow` 认定义处,服务方法被别的条目调用时仍归服务自己),`baseUrl` 是挂载父 ctx 上的自有属性;`dir('account')` 要求调用链上 inject 了 `account`,否则 reject(不挂起等登录,见 plugin-system.md);`PLUGIN_DATA_DIR`;卸载不删数据 |
| `40203fe5` | §7 契约 | `BuiltinPlugin.config: BuiltinConfigBinding`(schema / 固定 scope / location / read / write / check / normalize / enabled / secrets / watch):`describe`/`updateConfig` 分流到绑定;开关合并进值里的 `enable`,插件始终挂载、忽略并清掉条目上的 `disabled`;打开开关也走校验;secret 打码、发回掩码或空串保留原值、`clear` 才清空(发了新值以新值为准);还没有文件可写时 503;覆盖层忽略这些条目;`status.bound` 让侧边栏一直列出它们的设置页 |
| `96b0836f` | §7 邮件 | `email_config.json` 换成基于 JsonFile 的单例 store:每次现读(桌面端直接改文件)、原子写、坏文件保留 last-good、补齐缺字段、`watchFile` 轮询(取代 docker 下不可靠的 `fs.watch`);登录前、通知关着时都能配;页面加"清空密码";`/api/email` 只剩 `/test`(不再依赖服务运行、强制校验字段、按"已开启"发,能在打开前先测试);新增前端 `useBuiltinConfig()` |
| `23abf343` | §7 Satori | 共用工厂 `botConfigBinding(key)`(读片段副本、写 = `patch` + `llob/config-updated` 由适配器热应用;没有账号文件时 503);`ConfigService.accountFile`;`validate.ts` 的 token 规则改成带字段路径的 issue,`POST /api/config` 与绑定共用;Satori 页改走插件 API(并发修改改为 409) |
| `137cd852` | §7 Milky | schema(webhook 必须 http(s))+ `normalize` 去空行 + token 规则;页面经一层本地外壳仍编辑 `config.milky` |
| `08950784` | §7 OneBot | `connect` = 按 `type` 的 tagged union 数组;schema 不严格(桌面端每行全字段、`name`/`filter` 为 null 都能过),写回用户原值(未知键、缺 host 的老 ws 行保持原样);token 规则报到具体那一行;四个设置页都改走 `useBuiltinConfig`,`BotConfigContext` 删除。真实后端端到端验证过四个页面 |
| `fe1680fd` | §9 step4 | 日志文件名加 pid (`src/main/logFiles.ts`),两进程共用一个 data/ 不再抢同一文件;启动和轮转时删 14 天前的 `llbot-*.log`(只动自己的,不碰 webui_access.log 和用户文件) |
| `b27a9e61` | §9 step4 | `webui_token.txt` 按 mtime 重读:桌面端/手改密码后不用重启就生效;文件没了保留上一个密码,不至于把 WebUI 敞开 |
| `ca273bc4` | §9 step5/6 | **破坏性:bot 配置目录化终态**。ConfigService 改成读写两份 `settings.json`(实例级 `config/global/`,账号级 `config/accounts/<uin>/`),`splitConfig` 按 `ob11/satori/milky/webui` 分账号、其余(含未知 key)归实例级;邮件搬到 `config/global/email.json`。启动时 `config/migrate.ts` 一次性把旧 `config_<uin>.json`(实例级字段取最近用过的那个账号)和 `email_config.json` 拆/搬进新位置、旧文件改名 `.bak`;已迁移后旧文件又出现(没升级的桌面端重建)只告警、不覆盖真设置。端到端验证过:旧布局启动后正确拆分 + `.bak` + `/api/config` 合并值正确,二次启动幂等。生成端(本仓库 `script/install-llbot-docker.sh`、桌面端、docker/nix)仍写旧路径,靠这次迁移兜底 —— 它们的升级是跨仓库后续 |
| `35640c76` | §7 修正 | 卡片开关打开时不再一律校验:绑定加 `validateOnEnable`,适配器声明(token 规则是安全闸,不能借开关绕过),邮件不声明 —— SMTP 没配好也能先打开(只是发不出去)。保存时照旧校验:通知开着才要求 SMTP / 发件人 / 收件人齐全,关着可以存空配置(issue #690) |
| `d1f2eb02` | §9 step5/6 回归 | 目录化后,不存在的账号文件读成空对象(原来是整份换成 `default_config.json`);没有 `ob11` 被 `migrateConfig` 当成 `connect` 还不是数组的老格式,写回一份关闭的 OneBot + 旧连接行 —— **`ca273bc4` 之后首次登录的账号 OneBot 默认是关的**。改成只转换"有 `ob11` 但没有 `connect` 数组"的,缺 `ob11` 由默认值补齐。已经被写成关闭的账号文件不会自动改回 |

**实测遗留**:`default_config.json` 与 `defaultConfig.ts` 的签名地址原来不一致(JSON 是旧的 `llob.linyuchen.net`),改名为 `musicCardSignUrl` 时已统一成 `ss.xingzhige.com`;旧配置里含 `linyuchen` 的值仍在加载时改写。另外 `mergeNewProperties` 会按下标递归进数组:`ob11.connect[i]` 缺的键从 `default_config.json` 的第 i 行补(实测老格式转出来的 ws 行被补上了默认 ws 行的 `host`),行顺序和默认不同时会补进别的连接类型的字段。只补不改,改造前就是这样,未动。
