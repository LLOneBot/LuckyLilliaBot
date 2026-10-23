# 配置存储标准

> 把 bot 配置、账号状态、插件配置的存放理清成"实例级 / 账号级"两层,并给插件配置和插件数据定一套统一标准。核心判断:**插件系统还没发布,现在定插件配置格式不用迁移任何用户文件;发布后再改就要迁移用户数据 + 兼容已发布插件。这是唯一的零成本窗口。**
>
> §5(插件配置两层)、§6 的目录布局、§8(JsonFile)已实施,见 §9.5 的 Cut 0/1/2;§7(内置插件接入)与 §9 第 6 步(bot 自有配置搬迁)仍是设计。基线 `feat/plugin-system @ c8236196`。相关:[core-pluginization.md](core-pluginization.md)(协议层/account 解耦)、[official-qq-bot.md](official-qq-bot.md)。

## 1. 为什么

调研(四路:bot 配置现状、插件配置现状、外部仓库对 data 文件的依赖、Koishi 做法)挖出的问题:

- **`config_<uin>.json` 混了两类东西**。真属于账号的只有适配器端点、登录凭证、消息库;`log`/`logLevel`/`ffmpeg`/`msgCacheExpire` 是实例级设置,却被每个账号重复存一份。
- **`ConfigService` 本身有几个真 bug**:`cleanupConfig` 以 `defaultConfig.ts` 为白名单删未知字段,导致 `logLevel` 永远存不住(它在 JSON 模板里有、TS 默认值里没有);读到坏 JSON 会广播一份默认配置;2 秒防抖直接丢期间的改动;`set_config` 整份覆盖文件。
- **插件配置有三种存法**:普通插件存 `plugins.json`(schema 校验,但全局一份、不分账号);内置适配器读 `config_<uin>.json` 的片段;邮件通知单独 `email_config.json`。插件没有按账号的配置,也没有约定的数据目录。
- **`plugins.json` 每次保存写的是本进程内存里的整份快照**,同一个 `data/` 跑两个进程会互相覆盖。

## 2. 原则

1. **配置按作用域组织进 `data/config/` 下的目录**:`data/config/global/`(实例级)、`data/config/accounts/<uin>/`(账号级),账号目录内可再按需分文件。终态是所有配置都在这套目录里,比一堆 `xxx_<uin>.json` 平铺在 `data/` 根清晰、可扩展。
2. **分两步到达这个终态,避免一次性破坏外部兼容**:插件相关的配置(`plugins.json` 两层)是**还没发布的新东西、没有任何外部程序读写**,这一期直接按目录建好,零成本;bot 自己的对外配置文件(`config_<uin>.json`、`email_config.json`)**这一期保持原位原格式不动**,作为带自动迁移 + 外部仓库同期升级的后续步骤搬进同一套目录(见 §9)。
3. **新东西只在运行时创建,且只在 `data/` 下**。发布物顶层永不出现 `data/`。
4. **非配置的账号数据/凭证不进 `data/config/`**:`qq-session-*`、`database/<uin>.v3.db`、`webui_token.txt`、`auth_token*.txt`、设备身份——它们是数据/凭证不是配置,各有外部消费者和各自的位置,保持不动。新文件名不能命中外部程序的正则(桌面端 OpenClaw 的 `config_*.json`、session 的 `^qq-session-([0-9]+)(?:-([a-z]+))?\.json$`)。
5. **搬迁完成前,`config_<uin>.json` 等对外文件保持名字/位置/格式不变**:桌面端(封闭强类型模型)、docker/nix(sed 模板)、CLI、4 篇文档都在读写它们。`config_<uin>.json` 永远写全量纯 JSON(不写注释):桌面端缺字段会填自己的默认值(`satori.host` 默认 `""` = 监听全部地址),所以加载补齐缺省后要写回,**只补不删**。

## 3. 目标布局

```
<llbot.js 所在目录 = cwd>/
├─ default_config.json                 模板,不动;docker/nix 的 sed 照旧;单测锁定它与 defaultConfig.ts 一致
└─ data/                               DATA_DIR = path.resolve('data'),不动
   ├─ config/                          配置根,按作用域分目录
   │  ├─ global/
   │  │  ├─ plugins.json                [实例] 插件条目 + 全局配置层(本期新增,version 1)
   │  │  └─ (后续)settings.json / email  实例级设置、邮件配置搬入
   │  └─ accounts/<uin>/
   │     ├─ plugins.json                [账号] 插件覆盖层,设置过才有(本期新增)
   │     └─ (后续)bot 设置 + 适配器配置   由 config_<uin>.json 迁入,可再拆分类文件
   ├─ config/global/settings.json        [实例] log/logLevel/ffmpeg/msgCacheExpire... (由 config_<uin>.json 的实例级字段迁入)
   ├─ config/global/email.json           [实例] 邮件 (由 email_config.json 迁入)
   ├─ config/accounts/<uin>/settings.json [账号] 适配器端点 + WebUI 地址 (由 config_<uin>.json 的账号级字段迁入)
   ├─ config_<uin>.json.bak / email_config.json.bak  迁移后保留的旧文件备份
   ├─ plugin-data/<key>/shared/         [实例] 插件数据(非配置,不进 config/):ctx.storage.dir(),也是该条目 ctx.baseUrl
   ├─ plugin-data/<key>/<uin>/          [账号] ctx.storage.dir('account')
   ├─ state/                            bot 私有、不要手改:写锁、last-good、账号锁
   ├─ qq-session-<uin>[-<p>].json       [账号 x 协议] 不动(数据/凭证,非配置)
   ├─ database/<uin>.v3.db              [账号] 不动(ctx.database)
   ├─ webui_token.txt  auth_token[.dev].txt  machine_guid.bin  macos_device.json   不动
   ├─ plugins/                          插件代码,运行时只读,不动
   └─ logs/  temp/  packets/            不动;日志文件名加 pid + 保留期 + temp 清理(第 4 步)
```

> 命名用 `global` / `accounts`,不带 `config_` 前缀(已经在 `config/` 下,再前缀冗余)。账号目录内早期一个 `plugins.json` 够用,后续配置迁入时再按类别拆子文件,不必一开始就分很细。


## 4. 作用域规则

| 作用域 | 定义 | 放什么 | 登录前可用 |
|---|---|---|---|
| 进程 | 只来自 argv/环境变量,不落盘 | `--protocol` `--cdn` `--dev` `--pmhq-*` `--plugin-*` `-q` `--debug`;新增 `LLBOT_WEBUI_HOST/PORT`、`LLBOT_LOG_LEVEL`;`FFMPEG_PATH` 不变 | 是 |
| 实例 | 一个 data 目录,所有进程/账号共用 | `config/global/plugins.json`、`email_config.json`、两个 token、设备身份、`plugin-data/*/shared/`、日志、temp | 是 |
| 账号 | 一个 uin,一个进程只服务一个 | `config/accounts/<uin>/plugins.json`、`config_<uin>.json`、`database/<uin>.v3.db`、`plugin-data/*/<uin>/` | 仅带 `-q` 且文件已存在时预读 |
| 账号 x 协议 | (uin, protocol) | 只有 session | — |
| 条目 | `config/global/plugins.json` 里一个 id | 两层配置都按 id 存;数据默认按包存 | 跟随条目 |

**bot 设置生效顺序**(后覆盖前):代码默认 < `default_config.json`(只在新建账号文件时用) < `config_<uin>.json` < 环境变量 < argv。

- `get()` 返回叠加环境变量后的视图,**但写入一律基于磁盘内容,环境变量的值永不写回文件**。实现上:`patch()` 落盘前,用一份"被 env 覆盖的字段清单"把这些 key 从待写片段里剔除(对照挑错 P4,否则用户在同一片段改了别的字段时,会把 env 的值固化进文件),并加单测。被 env 锁定的字段在 WebUI 显示为只读并标出变量名。
- 实例级字段(`log`/`logLevel`/`ffmpeg`/`msgCacheExpire`)暂时仍每个账号存一份,WebUI"其他配置"页注明。要不要搬到独立 `settings.json` 见第 5 步(owner 决策)。

## 5. 插件配置标准(零迁移窗口的核心)

```jsonc
// data/config/global/plugins.json:插件条目 + 配置全局层
{ "version": 1, "entries": [ { "id": "7f3a9c21", "name": "luckylillia-plugin-keyword-reply", "config": { "rules": [] } } ] }
// data/config/accounts/<uin>/plugins.json:账号覆盖层
{ "version": 1, "entries": { "7f3a9c21": { "config": { "groups": ["123456"] } }, "b1d4e880": { "disabled": false } } }
```

**生效值**:`config(e,u) = merge(schema 默认值, e.config, overlay[u][e.id]?.config)`;`disabled(e,u) = overlay[u][e.id]?.disabled ?? e.disabled ?? false`(core 条目恒 false)。

- **合并按 schema**:只有 `object` 节点逐 key 递归,`dict`/`array`/`union`/标量整体替换(和前端 `stripDefaults` 把数组当整体一致)。
- **条目只在全局层增删**,覆盖层只能覆盖已存在的 id;引用了已删 id 的覆盖加载时忽略、下次写时清掉。
- **新账号自动继承全局层**,不会"换号后插件全没了"。"只在 A 号运行"= 全局层 `disabled:true` + A 的覆盖层 `disabled:false`(新建实例给"只在本账号启用"勾选项)。
- **落盘存差异**:全局层存相对 schema 默认的差异,账号层存相对全局生效值的差异;差异由服务端算,`PUT` 收完整值。`withDefaults`/`stripDefaults` 抽成不依赖 node 的纯模块,前后端共用。
- **校验永远只校验合并后的生效值**(单独校验某层会被 `required` 字段拒掉)。保存全局层时,把每个 `config/accounts/*/plugins.json` 对这个条目的覆盖合并后各校验一次。**但某个账号的覆盖不合法时,跳过并记告警、不阻断保存**(对照挑错 P2:否则 B 账号一个坏覆盖就能卡死 A 账号的全局配置面板,而 A 这个进程根本没有 UI 去改 B 的覆盖);该账号登录时再自行校验。
- **写入路由**:WebUI 明确选了层就写那层;没选层的写入(卡片开关、插件自更新)写到"当前生效值来自的那层",两层都没定义则看清单 `llbot.configScope: "global" | "account"`(默认 global);登录前一律写全局层。
- **登录时序**:`AccountService.markOnline()` 在 `reflect.notify(['account'])` 前先同步 `emit('account/prepare', uin)`;ConfigService 和 PluginService 在这个事件里切账号文件、读覆盖层、对等待中的条目 `fiber.update(merged, true)`。结果:inject 了 `account` 的插件第一次拿到的就是合并配置;只有"登录前就运行且本账号有覆盖"的插件在登录时重启一次(带 `-q` 且覆盖文件已存在时连这次也省)。
- **WebUI**:`GET /:id/schema` 返回 `{ schema, defaults, global, account, effective, configScope, rev }`;`PUT /:id/config` 带 `{ config, scope, ifRev }`,rev 不一致返 409;只有"已知账号 ≥2 或本账号已有覆盖"时才显示"所有账号 / 仅 <uin>"页签(单账号用户界面和今天一样)。

## 6. 插件数据标准

> 已实施(见 §9.5 记录)。与下文的一处差别:`dir('account')` 采用了"和 `inject(['account'])` 绑定"而不是"登录前挂起等待",理由见 [plugin-system.md](plugin-system.md) 的"插件数据目录"一节。

```ts
// packages/plugin-sdk/src/storage.ts(只有类型)
export interface PluginStorage {
  /** 'global' -> data/plugin-data/<key>/shared/; 'account' -> data/plugin-data/<key>/<uin>/。
   *  首次使用时创建,同一个包的所有实例共享。 */
  dir(scope?: 'global' | 'account'): Promise<string>
}
declare module 'cordis' { interface Context { storage: PluginStorage } }
```

- `<key>`:第三方插件用包名把 `/` 换 `+`;内置条目用 `_builtin+<名字>`(冒号在 Windows 路径非法,`_` 开头不会撞真实包名)。
- **`dir('account')` 在登录前挂起等待,不抛异常**(对照挑错 P5:否则没 inject `account` 的插件在 `apply` 里调它会直接 FAILED);或在 SDK 类型上把它和 `inject(['account'])` 绑定。
- 设置条目的 `ctx.baseUrl` 指向 `shared/` 目录,让 `@cordisjs/plugin-database-sqlite` 这类用 `new URL(path, ctx.baseUrl)` 的生态插件文件落在自己目录。
- 按账号的结构化数据继续用 `ctx.database`(`<uin>.v3.db`)。
- `plugin-data/` 在插件代码目录之外,不触发热重载 watcher;卸载插件不删数据(以后删最后一个实例时再问)。

## 7. 内置插件接入

> 已实施(见 §9.5 记录与 [plugin-system.md](plugin-system.md) 的"内置插件的配置绑定")。与下文的差别:只给邮件密码打码,适配器 token 不打码(页面本来就显示 token);`get_config` 打码与 `set_config` 校验会改变对外 OB11 API 的行为,等 owner 决定。

内置适配器 / 邮件通知接到同一套 schema + 校验 + 表单,但**配置继续读写原来的文件**(适配器的在 `config_<uin>.json`,邮件的在 `email_config.json`),不迁移。开关合并:条目开关和 `*.enable` / `enabled` 合并成一个(和桌面端一键对接改同一个开关),适配器/邮件条目始终挂载、`disabled` 像 core 一样忽略。

邮件顺带修三件事:监听从 `fs.watch` 改 `watchFile`(docker bind mount 下 inotify 不可靠);停用时也能配置。**但保留 `********` 密码打码**(对照挑错 P1:去掉打码会让 `GET /api/email/config` 明文返回 SMTP 密码,而 docker 默认监听全部地址;这是现存唯一的 secret 保护)。要"能清空密码"用显式语义区分(body 带 `clearPassword: true`,或约定 `null`=保留、`""`=清空),不靠明文回传。

## 8. JsonFile 原语 + 并发

所有 JSON 文件统一用 `JsonFile<T>`(从 `PluginStore` 抽出,第 1a 步先给 ConfigService 用):

- **读**:JSON5 解析;失败保留上一份有效值,不广播,WebUI 提示,下次轮询重试(不再"读坏广播默认值",也不再把坏文件改名)。
- **写**:先写 `<file>.<pid>.<rand>.tmp` 再 rename(修掉固定临时名);Windows 下 rename 失败回退直接写。
- **识别自己的写入**:记内容哈希,取代 `skipNextWatch`。
- **监听**:`fs.watchFile` 1 秒轮询 + 300ms 尾随防抖(保证最后一次写一定被读到;docker 下 inotify 不可靠才用轮询)。
- **共享文件**:`update(mutator)` 在 `state/<file>.lock` 锁内"重读、重放这次操作、原子写"。锁记 pid **加 host/boot id**(对照挑错 P3:docker 多容器 bind-mount 同一卷时 pid 会在各自 namespace 内相撞,只对同 host 判存活,非同 host 保守等待;文档写明"一个 data/ 只能单机用")。操作写成可重放的(例如"确保包 X 至少有一个条目"),两个进程同时扫到新包也只建一个。

## 9. 分步迁移(每步可独立回滚)

**第 0 步(兄弟仓库,约 1.5-2.5 人日)**:桌面端模型加 `[JsonExtensionData]`、JSON 容忍注释、补 `logLevel`,不再用默认值新建配置文件,OpenClaw 精确匹配当前 uin;CLI `migrate` 发现目标非空就拒绝(现在会 `remove_dir_all`);发布流程断言 dist 顶层无 `data/`。

**第 1a 步(进 main,随补丁版本,约 4-5 人日)**:ConfigService 换 `JsonFile`,删白名单清理、只显式删已知废弃 key;`mergeNewProperties` 数组当整体、`null` 视为缺省;补齐缺省仍写回但只补不删;`defaultConfig.ts` 补 `logLevel`,单测断言两份默认值相等且 docker/nix 的 sed 仍命中;新增 `ctx.config.patch()`,`POST /api/config` 和 `set_config` 改用它;新增 `LLBOT_*` 环境变量层 + `/api/login-info` 返回生效值;三处硬编码 `resolve('data')` 改 `DATA_DIR`。双向兼容,回退无害。

**第 1b 步(feat 分支,约 1-1.5 人日)**:OB11/Milky 只在自己片段变化时重建;前端各设置页只提交自己的片段;"其他配置"页标注作用域、env 锁定字段显示只读。

**第 2 步(feat 分支,合并前必须完成,约 11-13 人日)**:§5、§6、§8 的全部内容;文档新建 `docs/config-storage.md`(本文),改 `plugin-system.md` / `plugin-authoring.md`。新增 `data/config/global/plugins.json`(由现在的 `data/plugins.json` 挪入,开发期直接迁)、`data/config/accounts/<uin>/plugins.json`(设置过覆盖才有)、`plugin-data/`、`state/`。

**第 3 步(发布后,逐个内置插件接入,约 8.5-10.5 人日)**:顺序邮件→Satori→Milky→OB11(OB11 的 `connect` 是按 type 的 union,最费事);每个写 schema + 跨字段校验 + 绑定,`describe`/`updateConfig` 不再对它 403;邮件改轮询/停用时可配/能清空密码;`get_config` 打码。

**第 4 步(按需,约 5-7 人日)**:同进程换号(AccountService 状态切换 + `qq/logged-out`);账号锁(`state/<uin>.lock`,带 pid+host);`webui_token.txt` 按 mtime 重读;日志文件名加 pid + 保留期;实现 temp 清理(`autoDeleteFile` 后端目前根本没实现)。

**第 5 步(可选,约 3-4 人日)**:实例级字段搬到 `data/config/global/settings.json`。

**第 6 步(破坏性,需跨仓库同期升级,单列一个大版本)**:把 bot 自己的对外配置搬进 `data/config/` 完成目录化终态——`config_<uin>.json` 的内容迁入 `data/config/accounts/<uin>/`(可拆分类文件)、`email_config.json` 迁入 `data/config/global/`。做法:启动时检测旧文件、一次性自动迁移(保留旧文件备份一个版本),同期升级桌面端(改强类型模型的读写路径)、docker/nix 的 sed 目标、CLI、4 篇文档;用户手里改不到的旧 docker-compose / nix 配置 / 手改文件靠启动迁移兜底。`qq-session-*` / `database/<uin>.v3.db` / token / 设备身份是数据凭证不是配置,不搬。

## 9.5 本期开工切分(Cut 0/1/2,基于代码现状核对)

动工前对 `feat/plugin-system @ 49f6b6c3` 做过一次四路只读核对,结论修正了本文几处假设:

- **§8 的 `JsonFile` 基本是"抽取+共享",不是新建**:`PluginStore`(`src/plugin/store.ts:42-59`)已实现 tmp+rename、Windows 回退、进程内串行化、JSON5 读 / JSON 写、坏文件改名。缺的只有跨进程锁、content-hash 自写识别、`update(mutator)`。`EmailConfigManager`(裸 `writeFile`)、`ConfigService`(`writeFileSync`+`skipNextWatch`)健壮度各不同,正好统一。
- **`stripDefaults`/`withDefaults` 已存在且是纯函数,但有一个真 bug**:现仅在前端 `src/webui/FE/components/plugins/schema/values.ts`,**不读 schema**,按运行时 `isPlainObject` 递归。`dict` 运行时即 plain object → 被误逐 key 合并而非整体替换。抽成共用模块时**必须改成 schema 感知**,否则本文 §5"合并按 schema、前后端一致"在 dict 上不成立。
- **服务端今天不算差异**:前端 `stripDefaults` 后 PUT,后端 `index.ts:251` 收到什么存什么,defaults 只在前端 `withDefaults` 还原。§5 把算差异+两层合并的职责搬到服务端,是语义迁移。
- **`account/prepare` 事件零基础,但 `account` 服务本身存在**:`markOnline()`(`account.ts:41`)末尾只有 `reflect.notify(['account'])`,无 prepare 事件、无订阅者;`PluginService.inject = ['timer']`,`src/plugin/` 下零 account 引用。因 account 服务今天就在,§5 登录时序**不硬依赖 core-pluginization**,只需插一行事件 + PluginService 监听(overlay 加载像 ConfigService `-q` 预读那样推迟到 prepare)。
- **路径仍在 `data/plugins.json`**(`src/main/main.ts:88`),目录化是 docs-only;移动是一行(`PluginStore.write` 已递归 mkdir)。三处硬编码 `resolve('data')` 都在 `direct-lib/{macosDevice,machineGuid,packetDump}`。

**发布硬约束是"锁死磁盘格式"**:目录布局 + 两个文件格式 + 差异存储语义(全局层存相对 schema 默认的差异、账号层存相对全局生效值的差异)必须在插件系统发布前定死;登录时运行时应用、WebUI 作用域 / rev 协议是行为 / 内部 API,不锁格式。据此分三刀(每刀独立可落、可回滚):

**Cut 0 — `JsonFile<T>` 原语(§8,纯抽取,低风险,两条轨共享前置)**
- C0.1 新建 `src/common/jsonFile.ts`:从 `PluginStore` 抽出 tmp(随机名)+rename+Windows 回退、JSON5 读 / JSON 写、content-hash 自写识别、坏文件保留 last-good(**停掉改名**)、`update(mutator)` 在 `state/<file>.lock`(pid+host/boot id)内重读重放原子写;配单测;不动调用方。
- C0.2 `PluginStore` 迁到 `JsonFile`(行为保持)。

**Cut 1 — 插件配置两层(§5,发布前必须,本期 headline;owner 已定做满)**
- C1.1 把 `stripDefaults`/`withDefaults`/`isEqual` 提成 node 无关共用模块,**改成 schema 感知**(object 逐 key、dict/array/union/标量整体替换),修 dict bug;前端改 import 它;前后端一致性单测。
- C1.2 目录移动 `data/plugins.json → data/config/global/plugins.json`;引入 `data/config/accounts/<uin>/plugins.json` 路径常量。
- C1.3【语义锁】服务端差异存储+两层合并落在 `describe()`/`updateConfig()`/`validateConfig()`:describe 返回服务端合并的 effective,updateConfig 收完整值、服务端算差异、校验合并后生效值。此刻账号覆盖层是空的第二 store,WebUI 仍单作用域——但全局层差异格式与合并语义已锁死。
- C1.4 账号覆盖层运行时:`account.ts` 加 `emit('account/prepare', uin)`(在 `reflect.notify(['account'])` 前);PluginService 监听、加载 overlay、重算、对 pending 条目 `fiber.update(merged)`;`disabled(e,u)`;写入路由(scope);保存全局层时对每个 overlay 重合并校验,**坏覆盖跳过记告警不阻断**(P2)。
- C1.5 WebUI 契约:describe 扩成 `{schema,defaults,global,account,effective,configScope,rev}`;PUT `{config,scope,ifRev}` + 409;前端作用域页签(仅"已知账号≥2 或本账号已有覆盖"时显示)+ 409 回滚重拉。

**Cut 2 — ConfigService §1a(可并行,独立进 main,不阻塞 Cut 1)**
复用 Cut 0 的 `JsonFile`:删白名单 `cleanupConfig`、`defaultConfig.ts` 补 `logLevel`、新增 `patch()`(剥 env 锁定字段再写)、`POST /api/config` 与 OneBot `set_config` 改用 patch、`LLBOT_*` env 层、三处 `resolve('data')` 归 `DATA_DIR`。动的是 live 的 `config_<uin>.json`(双向兼容),回归面独立。

顺序:**Cut 0 → Cut 1(C1.1→C1.5)**,Cut 2 任意时机并行。

### 实施记录(已完成)

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
| (本提交) | §9 step5/6 | **破坏性:bot 配置目录化终态**。ConfigService 改成读写两份 `settings.json`(实例级 `config/global/`,账号级 `config/accounts/<uin>/`),`splitConfig` 按 `ob11/satori/milky/webui` 分账号、其余(含未知 key)归实例级;邮件搬到 `config/global/email.json`。启动时 `config/migrate.ts` 一次性把旧 `config_<uin>.json`(实例级字段取最近用过的那个账号)和 `email_config.json` 拆/搬进新位置、旧文件改名 `.bak`;已迁移后旧文件又出现(没升级的桌面端重建)只告警、不覆盖真设置。端到端验证过:旧布局启动后正确拆分 + `.bak` + `/api/config` 合并值正确,二次启动幂等。生成端(本仓库 `script/install-llbot-docker.sh`、桌面端、docker/nix)仍写旧路径,靠这次迁移兜底 —— 它们的升级是跨仓库后续 |

**实测遗留**:`default_config.json` 与 `defaultConfig.ts` 的 `musicSignUrl` 本来就不一致(JSON 是旧的 `llob.linyuchen.net`,而 `migrateConfig` 又会把含 `linyuchen` 的值改写成 TS 里的 `ss.xingzhige.com`)。未动它,单测里列为已知例外。

**没做(仍属设计)**:OB11 `get_config` 给 token 打码、`set_config` 加 token 校验(owner 定为不做,会变对外 API 行为);§9 第 4 步的"同进程换号 + 账号锁"(owner 定为暂不做);生成端(install 脚本 / 桌面端 / docker-nix)改写新配置路径(跨仓库后续,目前靠启动迁移兜底)。

**已知局限(已解决)**:同一个片段被两处并发修改时,页面原来保存的是它加载时那份,会覆盖掉另一处的修改。四个内置设置页改走 `describe` + rev/409 后,这种情况会被拒绝并重新载入(端到端验证过);"其他配置"页仍是片段级 `POST /api/config`,没有 rev。

## 10. Owner 决策(含建议默认)

1. **配置目录化怎么到达终态** → 本期只把插件配置按 `data/config/{global,accounts/<uin>}/` 目录化(零成本、卡在插件系统发布前的零迁移窗口);bot 自己的 `config_<uin>.json` / `email_config.json` 作为后续破坏性大版本(第 6 步)带自动迁移搬进同一目录。短期接受"新配置按目录、旧配置平铺"并存。不建议这一期就搬旧文件(要跨仓库同期升级 + 兜底用户手里的旧文件,风险大)。
2. **实例级字段是否搬出 `config_<uin>.json`** → 建议第 5 步再做,先原地标注"每账号一份"。
3. **邮件密码"清空 vs 保留"的语义** → 建议 body 带显式 `clearPassword`,保留打码。
4. **`SendOptions`/配置里要不要支持环境变量引用 secret** → 建议暂不,明文存储 + POSIX 下 `plugins*.json` 0600 权限 + 不写日志。

## 11. 未验证 / 风险

- Rust 移植版是否也按白名单删 key,待确认(但它不与 TS bot 并发共享同一 `data/`,新文件对它只是忽略)。
- `JsonFile` 用内容哈希识别自写:外部写入恰好产生相同内容时会被当自写跳过(概率低)。
