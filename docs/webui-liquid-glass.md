# WebUI Liquid Glass 材质层

WebUI 前端 (`src/webui/FE`) 的视觉语言按 Apple Liquid Glass (iOS 26 / macOS 26) 重做。
本文记录材质层的结构、实测出来的平台限制, 以及后续改样式时必须遵守的几条规则。

## 文件结构

| 文件 | 职责 |
|------|------|
| `styles/tokens.css` | 设计令牌: 字体栈 / 同心圆角梯 / 强调色 / Apple 系统色 / 文字四级 / 玻璃 alpha-blur-saturate / 镜面 rim / 内壁光 / 投影 / 动效曲线。light 在 `:root`, dark 在 `.dark` |
| `styles/glass.css` | 材质本体: `.glass` 基类 + `glass-clear / regular / thick / chrome` 四档, rim 伪元素, `glass-dim`, `glass-interactive`, 降级 (`@supports` / `prefers-reduced-transparency` / `prefers-contrast` / `prefers-reduced-motion`); 以及 `@utility` 形式的 `r-*` 圆角梯 / `fill-*` 平色填充 / `hairline-*` / `scrim` |
| `index.css` | `@import` 上面两者; base 层 (字体 / body 背景 / 滚动条 / 选区 / focus); 旧语义类 (`text-theme*`, `bg-theme-*`, `border-theme*`) 重映射到令牌; `btn-primary` / `btn-glass` / `input-field` / `switch-toggle*`; 硬编码 `*-pink-500` 系 Tailwind 类映射到 `--accent` |
| `styleguide.html` + `styleguide.tsx` | 材质样板页, 只在 dev 下 `http://127.0.0.1:15173/styleguide.html` 可访问, 不进 build。改令牌先来这里对照 |
| `components/common/AnimatedBackground.tsx` | 壁纸画布: 底部渐变 + 左上光源 + 5 个大而柔的色团缓慢漂移, 全部画进 canvas (CSS body 背景只是 fallback); 跟随 `themeStore.isDark` 换色板, 尊重 `prefers-reduced-motion`; 每帧画完调 `glassFrame()` |
| `utils/glassRuntime.ts` | 玻璃运行时: 注册表 + 每帧把元素每条边内侧的壁纸 GPU->GPU 拉伸画进透镜 canvas 的 14px 边缘环 (凸透镜边缘放大); 亮度采样读的是 `AnimatedBackground` 另画的 96px CPU 小镜像 (自适应 tint, 写 `--glass-lum` 和 `.glass-on-dark` / `.glass-on-light`) |
| `components/common/GlassDebug.tsx` | 诊断浮层, URL 带 `?glassdebug=1` 才挂: 帧计数 / 每片玻璃的 lum / `glass-on-*` / 透镜 tint / 计算背景色。用户那边复现不了时让他截这个 |
| `components/common/GlassLens.tsx` | 放在玻璃元素第一个子节点, 把父元素注册进运行时并渲染透镜 canvas。**只给坐在裸壁纸上的元素用** (Sidebar / 登录卡 / 样板页), 拷贝不知道 DOM, 会把壁纸画在内容上 |

## 材质是怎么叠出来的

一片玻璃 = 五层:

1. 半透明 tint: `background-color: rgb(var(--glass-tint) / alpha)`, alpha 按档位
2. 背景处理: `backdrop-filter: blur() saturate() brightness()`
3. 内壁光: 一组 `inset` box-shadow, 上缘亮 (`--lens-top`), 下缘暗 (`--lens-bottom`), 边缘微暗角 (`--lens-depth`)。**这一层承载"玻璃有厚度"的观感**
4. 镜面 rim: `::before` 伪元素, 1px 渐变环 (上亮 / 侧淡 / 下弱), 用 `mask-composite: exclude` 抠出边框
5. 外侧 0.5px 暗描边 (`--edge-shade`, spread shadow, 不占布局) + 冷色调投影 (`--shade`)

四档:

| 类 | 用途 | alpha (light/dark) | blur |
|----|------|--------------------|------|
| `glass-clear` | 浮在内容 / 媒体上的控件 | .12 / .34 | 8px |
| `glass-regular` | 卡片 / 面板 / 侧边栏 (主力) | .30 / .58 | 20px |
| `glass-thick` | 模态 / 弹出菜单 / 长文本 | .88 / .88 | 34px |
| `glass-chrome` | 按钮 / chip / 分段选择 | .42 / .70 | 9px |
| `glass-dense` | 修饰档, 叠在 thick 上: 盖在正文之上的密集弹层 (表情面板 / @ 选择器) | .95 / .94 | (随 thick) |
| `.card` | 内容卡 (Dashboard / 配置页): regular 的模糊配方 + 自己的 alpha | .52 / .68 | 20px |
| `glass-bar` | 贴在面板边上的 chrome 条 (聊天头 / 输入栏), 内容从它下面滑过。无 rim / 投影 / 圆角 | .74 / .80 | 20px |

亮色和深色的 alpha 差这么多不是手滑 (thick 除外, 它坐在内容上必须实): **亮色玻璃几乎是透明的**, 它的"体积感"来自背后饱和的颜色透过来,
边缘靠外侧暗描边 (`--edge-shade` .14) + 内壁暗角 (`--lens-depth` .09) 定义, 亮 rim 只是点睛。
第一版亮色沿用了深色的思路 (白 tint .5 + 白 rim), 结果是一块奶玻璃卡片, 背景色透不出来、白线在白面上不可见。
深色玻璃反过来: tint 要够密才能托住亮 rim。

旧语义类 `.card` 别名到 `glass` 基类 + regular 的模糊配方 + `--glass-alpha-card` (圆角 `r-panel`), `.bg-popup` 别名到 `glass + glass-thick` (圆角 `r-card`), 原有 ~60 处调用点零改动升级。

## 实测平台限制: backdrop-filter 不吃 SVG 折射滤镜

Liquid Glass 真正的标志是边缘折射带 (背后内容在边缘被压缩弯曲)。Web 上唯一能做实时 backdrop 折射的路径是
`backdrop-filter: url(#svg-filter)` 配 `feDisplacementMap`。**Chrome 会静默忽略它**:

- `CSS.supports('backdrop-filter', 'url(#x) blur(1px)')` 返回 `true` (语法合法)
- 同一个 SVG 滤镜用在 `filter: url(#x)` 上, 条纹底被明显扭曲 -- 滤镜本身正确
- 用在 `backdrop-filter: url(#x)` 上, 输出与不带 url() 的纯 blur **逐像素相同**
- Safari / Firefox 同样不支持

结论: **不要再往 backdrop-filter 里塞 url()**, 也不要靠 `CSS.supports` 探测它。折射带改用第 3 层内壁光画出来。

能走通的变通 (已实现, 见 `glassRuntime.ts`): 壁纸是我们自己的 canvas, 所以给玻璃元素塞一个子 canvas, 每帧把每条边内侧 (band 的 55%) 的壁纸
用 4 次 drawImage 拉伸画进 `--lens-band` (14px) 的边缘环, 再盖上元素自己的 tint -- 凸透镜边缘约 1.8x 的放大。中间仍是 backdrop 模糊。
**只能折射壁纸, 折射不了 DOM 内容**, 所以 `GlassLens` 只放在裸壁纸上的元素里。
第一版是 SVG `feDisplacementMap` 通过 `filter: url()` 挂在这个 canvas 上: 效果更真, 但 Chrome 在某些光栅路径下把带引用滤镜的 canvas 当成绘制时快照,
位图每帧在变滤镜结果却不刷新, 切主题后侧边栏留下一圈旧主题的环, 切导航 (布局变化) 才重绘。**不要再往会动的 canvas 上挂 `filter: url()`**。
验证方法: 样板页 / 应用页 `window.__glass.setGlassSource(<高对比条纹 canvas>)`, 边缘环里立刻能看到被拉伸的条纹; 真壁纸太平滑, 肉眼看不出。
如果将来 Chromium 落地 backdrop-root / 支持 backdrop 上的 SVG filter, 再回头把 `feDisplacementMap` 方案接回来
(位移图: R 通道编 x, G 通道编 y, 中心 128 无位移, 边缘 255/0; `color-interpolation-filters` 必须 `sRGB`)。

## 改样式必须遵守的规则

1. **材质无色**: 玻璃只用中性 tint。粉珊瑚 `--accent` 只出现在: 激活的导航项 / `btn-primary` / 开关开启态 / 选中态 `fill-selected` / 未读徽标。不要拿它当面填充。
2. **不要玻璃叠玻璃**: 玻璃容器里的行 / 输入框 / 标签用 `fill-quiet` / `fill-selected` / `bg-theme-item` 这类**平色**, 不要再加 `backdrop-blur-*`。两层 blur 叠起来两层都发灰。
3. **圆角选层级不选大小**: `r-window 28 > r-panel 22 > r-card 18 > r-control 12 > r-inner 8`, 内层 = 外层 - 间距。按钮 / chip / 开关一律 `r-capsule`。
4. **分割线用 hairline**: `hairline-t/b/l/r` 或已映射的 `border-theme-divider`。能靠间距和材质层次分开的就不要画线。
5. **不要在玻璃元素上再挂 Tailwind 的 `backdrop-blur-*` / `rounded-*` / `shadow-*`**: Tailwind utilities 层排在 components 层之后, 会**覆盖**材质类的 backdrop-filter / 圆角 / 内壁光 + 投影。要改圆角用 `r-*`。`rounded-none` 这种明确想抹掉圆角的例外可以用。
6. **模态遮罩用 `scrim`**: 不要手写 `bg-black/30 backdrop-blur-sm`。
7. 状态色用 `--sys-green / --sys-red / --sys-orange / --sys-blue` (Toast 图标、在线点、错误文字), 不用 Tailwind 的 `green-500` 系。
8. **底色可以偏粉, 但饱和度必须远低于强调色, 且不放玫红 / 橙 / 黄**: 亮色底 (`body` 渐变 + `LIGHT_FIELDS`) 现在是丁香-粉一族: 兰花紫 / 丁香 / 柔粉 / 腮红 + 一个周蓝冷锚点。粉可以有, 是粉彩不是洋红 -- 玻璃 `saturate()` 会再提一档, 玫红 / 橙透过玻璃就成红 (第一版踩过)。黄压在任何冷色上都混成灰橄榄。冷锚点留一个, 整屏才不会发暖。珊瑚 `--accent` 靠色相差 (偏暖) + 大幅的饱和度差保持"唯一饱和暖色"的地位。
9. **玻璃用在 chrome 层, 内容层要更实但不能白**: Apple 只把 Liquid Glass 给导航和控件, 内容坐在更实的面上。`.card` 用 regular 的模糊 + 自己的 alpha (.52): 试过借 thick 的 .88, 在这张淡紫壁纸上是一块白板, 和周围完全脱节。
   WebQQ 的聊天头和输入栏 (`ChatWindow.tsx` 的 `headRef` / `footRef`) 是绝对定位、贴边的 `glass-bar` 条 (.74): 内容在它们下面滑过并被模糊 (Liquid Glass 的分层), 但它们没有 rim / 投影 / 圆角, 属于面板本身。第一版做成 inset 12px 的悬浮圆角片, 聊天列读成三个独立物体, 而且 .3 的头部压在模糊图片上看不清会话名 -- 两个问题一起用 bar 解决。列表用 ResizeObserver 量两条的高度做上下 padding 让位; 输入栏和多选栏切换时观察的是外层包裹 div。virtualizer 没设 `scrollMargin`, 顶部约 70px 偏移靠 `overscan: 5` 吸收, `scrollToIndex` 的对齐会偏这么多, 可接受。
   厚材质 (thick .88) 只给对话框和菜单; 表情面板 / @ 选择器这种一整片小字形盖在正文上的再加 `glass-dense` (.95)。thick 的全局值已经来回调过五次, 别再为某一个场景动它 -- 需要不同密度就加档位。
10. **自适应 tint 是按元素的**: `.glass-on-dark` / `.glass-on-light` 由运行时按元素下方壁纸亮度打 (阈值 .40 / .48 带回滞), 令牌里深色材质集合的选择器是 `.dark, .glass-on-dark`, 浅色是 `:root, .dark .glass-on-light`; 强调色和状态色只跟主题不跟亮度。当前浅色壁纸下亮色主题永远不会触发, 换深色壁纸或照片壁纸时它才有意义。
    这两个 class 的优先级**高于主题 class** (故意的: 深色主题下压在亮色区域的片保持亮色), 副作用是采样一旦出错元素就会卡在错误主题里 -- 出现过一次: 亮度从加速 canvas 回读拿到旧帧, 切到深色后侧边栏仍是 `glass-on-light`, 内部 .3 的亮 tint 压在暗壁纸上看着是暗的, 只有 rim 和透镜环露馅, 表现为"一圈没跟着变, 切导航才刷新"。现在的保险: `AnimatedBackground` 的 effect (主题切换会重跑) 先调 `resetGlassAdaptive()` 清掉所有 `glass-on-*`, 下一帧从 CPU 镜像重新判定; class 翻转时立刻刷新透镜环的 tint 缓存。
    第二次复发 (用户截图: 亮色主题下侧边栏外面一圈深灰) 的根因是 **`prefers-reduced-motion: reduce`** (Windows 关了"动画效果"): 循环降到 2fps, 而 tint 刷新按帧数 (24 帧) 计 -> 12 秒; 翻转时那次立即刷新又读到了过渡动画中间的旧颜色 (侧边栏的 `transition-all duration-300` utility 压过了 reduced-motion 的 1ms 规则)。修法: tint 刷新改按时间 (翻转/重置后 600ms 内每帧, 之后每 200ms), reduced-motion 下循环 8fps, `index.css` base 层用 `!important` 把 reduced-motion 下所有 transition/animation 压到 1ms。**任何"每 N 帧做一次"的逻辑都要换算成时间**, 帧率不是常数。复现方法: playwright `page.emulateMedia({ reducedMotion: "reduce" })`, 或 `?glassdebug=1` 看浮层里的 tint。
11. **动效只有两种**: 按压 = `glass-interactive:active` 缩到 .97 + 圆角 `calc(var(--radius) + 6px)` (放在 `@layer utilities` 才能压过 `r-*`); 弹出 = `glass-pop` 用 `scale` 属性 (不是 transform, 不会打掉定位用的 translate) 从 .72 长到 1, 配 `origin-*` 指向触发点。Sidebar 的高亮是一枚滑动的 pill, 不是每项各自上色。
12. **底要有光源**: 亮色 `body` 顶部左上有一团白色 radial 辉光。玻璃 rim 上亮下暗讲的是"光从上面来", 背景里得有那个光源, 明度才有极点, 否则整屏是平的粉彩。色相越多混得越灰, 一族 3-4 个色相 + 明暗对比, 比五色调色盘更亮更干净。

## 开发注意

- **Tailwind v4 + `@tailwindcss/postcss` 对新增源文件不热感知**: 新建 `.tsx` 后里面的 utility 不会生成, 必须重启 `npm run dev-webui`。表现为 grid / max-w 之类全不生效但自定义类正常。
- 项目原来的 `tailwind.config.js` 在 v4 postcss 下**从未被读取** (v4 需要 `@config` 指令才读旧配置), 其 `theme.extend` 无一处被引用, 已删除。所有主题定义都在 `index.css` / `styles/*.css`。
- 亮色模式调参先看两样: 背景够不够有颜色 (body 渐变 + `AnimatedBackground` 的 `LIGHT_FIELDS` / `peak`), tint 是不是太白。玻璃不好看九成是"底太白 + tint 太白", 不是 rim 的问题。
- 模态遮罩 `scrim` 亮色只压黑 .16 (深色 .5), 靠 blur(10px) 做分离。压黑再重一点, 底就成灰紫, 上面的厚玻璃跟着变灰板。
- 背景色域是透视的"内容", 色团本身 alpha 不高 (light peak .55 / dark .4): 玻璃 `saturate(150-160%)` 会把它再提回来, 源色太艳就会过饱和。亮色底反而不能太淡, 否则玻璃透出来是白的。
- **不要每帧从加速的壁纸 canvas 回读像素** (getImageData, 或 drawImage 进一个 `willReadFrequently` 的 CPU canvas)。Chrome 会在回读累积后把源 canvas 降级成软件渲染, 大画布动画就会分块更新。亮度采样走 `AnimatedBackground` 用模型另画的 96px CPU 镜像; 透镜拷贝是 GPU->GPU 的 drawImage, 没有回读。
- 视口变大时 `AnimatedBackground.resize()` 会按比例移动色团位置 (位图重建会清空画布, 位置不动的话色团挤在左上角)。
- 壁纸位图是 CSS 尺寸的 0.5 倍 (`WALL_SCALE`), 画的时候用 `setTransform` 让绘制代码保持 CSS px; 柔色团肉眼无差别, 光栅工作量减 4 倍。canvas 元素带 `will-change: transform` 独占合成层 -- 软件光栅路径下大画布分块更新 ("莫名的方块") 的标准解法。运行时里所有几何都是 CSS px, 位图坐标用 `source.width / clientWidth` 换算。
- 圆角走 `--radius` 管道: `r-*` utility 同时设 `--radius` 和 `border-radius`, `.glass` 读 `--radius`; 需要按圆角算东西 (按压形变) 时用 `var(--radius)`, 别读 `border-radius`。
- `playwright-cli run-code` 里的 `console.log` 进的是页面 console 日志 (`.playwright-cli/console-*.log`), stdout 只回显脚本源码; 要拿返回值用 `--raw eval`。
- 在 bash 里内联 `powershell -Command "... $p ..."` 时 `$p` 会先被 bash 展开成空 -> PowerShell 解析错误 -> kill 没执行, 旧 dev server 带着过期的模块缓存继续占着 15173, 新的跑去 15174。杀端口用 PowerShell 工具本身。
- 用 playwright 截样板页对照: `playwright-cli -s=glass open --browser=chrome` -> `goto http://127.0.0.1:15173/styleguide.html` -> `screenshot`。切主题: `localstorage-set llbot-theme '{"state":{"mode":"dark"},"version":0}'` 后 reload。
