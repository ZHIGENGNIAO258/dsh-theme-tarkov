# dsh-theme-tarkov
![ Beta 横幅](docs/screenshots/banner.png)

以《逃离塔科夫》（Escape from Tarkov）主界面为灵感的 DeepSeek Harness（DSH）Web 界面主题插件：四段动态背景、Beta 警告横幅、提示音、背景音乐、Altyn 桌宠与状态行文本。


> **0.4.0：背景与主题升级**——四段内置动态背景（救世主 / 幸存者 / 欠债人 / 堕入黑暗），配置页可拖拽取景（16:9）；遮罩改为整屏覆盖、按实际对话列宽度与中心做 alpha 剖面（侧栏开合时跟随文本移动），新对话时完整显示背景；侧栏保留 20% 原生底色；「遮罩强度 / 遮罩明暗 / 渐隐带宽度 / 界面主题」均**按背景独立记忆**，切换背景时恢复该背景上次的设定；配置页顺序为背景优先，桌宠与背景音乐在最后。新增「浅色 / 深色 / 跟随系统」三态开关，与 DSH 自带外观设置同步。旧版 `bg.opacity` / `bg.tone` 设置自动沿用；新装默认直接进入救世主外观（`bg.clip` 固定为 `for-humanity`，不会被本地文件抢占）。

## 界面截图

| | |
| --- | --- |
| ![新对话 Beta 横幅](docs/screenshots/hero-banner.png) | 新对话界面的 Beta 警告横幅，文案与透明度均可在设置中调整 |
| ![插件配置页（动态背景部分）](docs/screenshots/settings-panel.jpg) | 插件页 → dsh-theme-tarkov：「塔科夫主题」配置卡片（0.4.0）的动态背景与按背景设置部分 |
| ![动态背景](assets/bg/for-humanity.jpg) | 全屏动态背景：内置四段方形循环视频之一（默认开启救世主，可拖拽取景） |
| ![BGM 浮窗](docs/screenshots/bgm-dock.png) | 右下角 BGM 浮窗|
| ![Altyn 桌宠](assets/pet/altyn.png) | Altyn 桌宠，点击发出随机语音，可拖动 |
| ![状态行文本](docs/screenshots/status.png) | 状态行随机文案 |

## 功能

- **Beta 警告横幅**：为新对话界面添加塔科夫风格的 Beta 测试横幅，文案与透明度可在设置中调整。
- **提示音**：会话完成、请求确认、中断失败、**工具调用失败**时播放对应音效；**每一次失败的工具调用都会响**（不再折叠成一轮一声）；后台标签页也会响；四种场景都可以换成你自己的音频。
- **背景音乐**：右下角浮窗播放器，曲库由你自己提供（目录放置或面板上传）；多个标签页同时打开时，只有 leader 标签页在播放。
- **动态背景**：内置四段 2048×2048 的 15s VP9 循环（默认救世主），也可放本地 `webm` / `mp4`。遮罩按对话列宽度与中心渐隐，侧栏开合时跟随；面板可按背景调强度 / 明暗 / 渐隐 / 主题与 16:9 取景，窄屏或减少动态 / 透明度时自动不启用。
- **深色模式开关**：面板内「浅色 / 深色 / 跟随系统」三态，直接调用 DSH 主题服务的 `ctx.theme.setTheme`，与「设置 → 通用 → 外观」共用同一份 `ui-theme` 偏好；该选择会记到当前背景上，切换背景时自动套用；新装默认救世主配浅色、其余三片段配深色，片段标签也会提示，但不会在未切换背景时擅自改主题。
- **Altyn 桌宠**：角落里的 Altyn 头盔小人——拖动换位置（自动记住）、**点击播放随机 Scav 语音**（包内 361 条）；把自备音频放进语音目录可加入随机池。
- **状态行随机文案**：运行中的「深度求索中」换成塔科夫风台词（如「正在寻找加密 U 盘...」），**每完成一步**（一次思考、一次工具调用）随机换一句；用时不会丢（0.1.7 起官方把耗时并进同一句，本插件换句时自动保留/注入，可在池文件里用 `{duration}` 自定义位置）。输入框下方的实时状态行（“N 轮 N 步 · N tok/s”与 Token / 缓存 / 费用）带一条长条卡片，文字位置与字号不变。
- **窄屏（手机竖屏，≤768px）适配**：桌宠自动隐藏**且不再下载皮肤图**；Beta 横幅字号降到 14 / 12px，图标与内边距同步收紧，**两段文本各自硬限两行**（`line-clamp`，文案再长也不会撑破布局）；≤380px 再降一档 13 / 11px。桌面视口（≥769px）完全不受影响。
- **设置面板**：插件页 → dsh-theme-tarkov →「塔科夫主题」（**默认展开**），顶部是一句话简介与 GitHub / Issues 链接，下面开启/关闭各功能、调整音量与横幅透明度、管理音乐曲库（添加 / 删除 / 禁用）。
- **插件列表图标**：插件页「已安装」列表里本插件行左侧显示 Altyn 头盔图标（`package.json` 的 `icon` → `assets/icon.png`，由 DSH 读成 data URL；规则见下）。

## 开箱默认

- 动态背景**开启**，片段固定为**救世主**（`for-humanity`，不会被本地 `bg/` 文件抢占）。
- 救世主：遮罩 **50%**、明暗 **0**、渐隐 **3vw**、**浅色**主题；取景上移（`y=0.1449`）。
- 幸存者 / 欠债人 / 堕入黑暗：遮罩 **42%**、明暗 **0**、渐隐 **5vw**、**深色**主题。
- 全局回退：遮罩 42%、明暗 0、渐隐 6vw（仅用于没有单独记录的片段）。
- 桌宠**关闭**（大小 112）；Beta 横幅**开启**、透明度 **0.85**；提示音**开启** 70；背景音乐**关闭** 40。
- 侧栏原生底色 20%；输入框下方状态行带长条卡片。
- 设置卡片顶部固定显示一句话简介、GitHub 仓库与 Issues 链接。

已有 `prefs.json` 的用户不会被覆盖，以上只影响新安装（或删除 `~/.dsh/dsh-tarkov/prefs.json` 后）。

## 安装

> **方式一（推荐）：npm 一键安装**

```bash
dsh plugin --profile web add dsh-theme-tarkov
```

> **方式二：git clone + link 安装**

```bash
git clone https://github.com/ZHIGENGNIAO258/dsh-theme-tarkov.git
dsh plugin --profile web add link:<绝对路径>   # 把 <绝对路径> 换成上面的克隆目录
```

`dsh plugin add` 会把本包加入 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles`，bundle 层**自动应用**包内 `cordis.patch.yml`（即插件行 `id: tarkov`）。重启 dsh web 即生效。

- **npm 安装**：无需保留任何目录；升级运行 `dsh plugin --profile web update dsh-theme-tarkov` 后重启 dsh web。
- **link 安装**：**请保留克隆目录不要删除**——profile 通过软链接引用它；升级只需 `git pull` 再重启 dsh web。

> 提示：包刚发布后 24 小时内安装可能被 DSH web profile 的「最低发布年龄」策略（`minimumReleaseAge: 24h`）拦截；稍等重试，或把 `dsh-theme-tarkov` 加入 profile `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`。

## 更新

```bash
# npm 安装：升级到最新版
dsh plugin --profile web update dsh-theme-tarkov

# link 安装：在克隆目录里拉取最新代码
git pull
```

两种方式升级后都要**重启 `dsh web`**（host 半区 `lib/index.js` 只在启动时加载）。

## 配置：文件放在哪里

| 位置 | 内容 |
| --- | --- |
| `~/.dsh/dsh-tarkov/music/` | 背景音乐：**直接把音频文件丢进去即可**（mp3 / wav / ogg / m4a / aac / flac），或在设置面板点「添加音乐」上传（上限 200MB） |
| `~/.dsh/dsh-tarkov/sounds/` | 提示音：内置音效（done.m4a / approval.m4a / error.m4a / tool_error.m4a）由插件直接伺服，**不需要复制**；想换音效就放一个同名文件（任意音频格式）到这里，或用设置面板上传 |
| `~/.dsh/dsh-tarkov/bg/` | 动态背景：把 `webm` / `mp4` 丢进去即加入面板列表；`auto` 模式下按文件名取第一个 |
| `assets/bg/`（包内） | 内置四段 2048×2048 方形 VP9 循环（`for-humanity` / `and-survived` / `did-not-escape` / `fall-in-darkness`，15s，约 0.4–1.4MB/段）+ 对应 1600×1600 JPEG 静帧 + `clips.json` 清单；取景在页面里由 `object-view-box` 完成，清单默认 16:9 中心，出厂 prefs 里救世主另上移到 y=0.1449 |
| `~/.dsh/dsh-tarkov/voice/` | 桌宠随机语音：**把音频文件丢进去即可**（mp3 / wav / ogg / m4a / aac / flac），与包内 361 条语音一起进随机池；不放任何文件也能玩 |
| `assets/pet/voice/`（包内） | **内置 361 条 Scav 语音**（mp3，44.1kHz 单声道 CBR 64kbps，合计约 5.7MB，随 npm 包分发） |
| `assets/status/texts.zh.txt`（包内） | **状态行随机文案池**（中文）：一行一句，`#` 开头的行与空行忽略，重复行只取第一条；每完成一步随机换一句。句子里可以写 `{duration}` 占位符（如「正在搜刮战利品 {duration}」），不写则自动在句尾补上用时（中文「（用时12秒）」/ 英文「(12s)」），所以随机换句**不会遮掉运行时长**。`texts.en.txt` 是英文池，缺失时英文界面回落到中文池。改完刷新页面即可，无需重启 |
| `~/.dsh/dsh-tarkov/pet/` | 桌宠自定义皮肤：放一张 `pet.png`（也可 gif / webp / jpg）覆盖默认的 Altyn 小人。 |
| `~/.dsh/dsh-tarkov/prefs.json` | 全部设置（音量、透明度、开关、禁用曲目等） |

安装后打开插件页 → dsh-theme-tarkov →「塔科夫主题」配置卡片，即可开启/关闭各功能、调整背景与主题、音量和横幅透明度、管理曲库。

## 技术实现（维护参考）

### Host 半区（`src/index.js` → esbuild 打包为自包含 `lib/index.js`）

- `/dsh-tarkov/prefs`：设置的读写；PUT 按字段合并，浏览器端自定义提示音以 dataURL 存储（单文件上限 2MB）。
- `/dsh-tarkov/sfx-poll` + `/dsh-tarkov/sfx`：提示音队列与音频服务；`classifySessionEvent` / `createSfxState` 完成事件分类与入队。四类音效：`turn/end` completed→`done`、blocked→`approval`、aborted / error / max-tokens→`error`，`approval/asked`（含 `tool/call ask_user_question`）→`approval`，以及 **`tool/result` 且 `message.isError === true`→`tool_error`**（即官方 session telemetry 读的同一个失败标志）。去重只剩一条：`approval/asked → decided` 配对只响一次，期间 blocked 的收尾静音。**工具失败不折叠**：每次失败都入队（0.3.0 之前按「回合」折叠成一次，用户读作「一次对话只响一次」）；`error.code` 为 `TOOL_ABORTED_*` / `TOOL_NOT_STARTED` / `TOOL_OUTCOME_UNKNOWN`（用户主动取消、或工具根本没启动）时仍不响。唯一的闸门是队列上限 `MAX_PENDING = 32`（浏览器端每 2s 排空一次，只挡同一个轮询窗口内的极端突发）。子代理会话整体不触发。
- 曲目库：`assets/music`（包内可选内置目录，**默认不含歌曲**——构建者放入音频即成为"内置曲目"，适合自定义发行）+ `~/.dsh/dsh-tarkov/music`（用户）按**文件名（不含扩展名）**合并，同名用户文件优先，内置曲目标记 `builtin`。
- `/dsh-tarkov/music`（曲目列表）、`/dsh-tarkov/music/add`（原始字节流式上传）、`/dsh-tarkov/music/delete`（用户文件删除磁盘文件；内置曲目写入 `music.removed` 从列表移除，可通过恢复按钮清除）、`/dsh-tarkov/audio`（流式播放）。
- 桌宠（`pet` prefs 组）：`/dsh-tarkov/pet/voice`（随机语音库列表 = 包内 `assets/pet/voice` 全部音频 + `~/.dsh/dsh-tarkov/voice/` 用户文件，**都由路由直接伺服、不复制**）、`/dsh-tarkov/pet/audio?id=&kind=`（`kind=builtin` 走包内目录，`kind=user` 走 voice 目录；id 防穿越 + 扩展名白名单）、`/dsh-tarkov/pet/image`（自定义 `pet.png` 优先，否则回退包内 `assets/pet/altyn.png`）。全部随 `pet.enabled` 门控。
- 动态背景（`bg` prefs 组）：`/dsh-tarkov/bg/list`（内置 + 本地片段、选中项、默认 crop）、`/dsh-tarkov/bg/poster?id=`（海报；本地片段无海报时 404）、`/dsh-tarkov/bg/preview?id=`（取景编辑器预览，**始终挂载**）、`/dsh-tarkov/bg/clip?id=` 与兼容旧路径 `/dsh-tarkov/bg`（**随 `bg.enabled` 门控**）。`id` 为 `auto`、内置 id 或 `user:<文件名>`；`auto` 优先本地目录第一个文件，否则第一段内置。新装 `bg.clip` 固定为 `for-humanity`，所以本地文件不会改变开箱外观；想启用本地优先时手动切到「自动」。`bg.crops` 每段保存归一化 16:9 矩形 `{x,y,w,h}`，`bg.perClip` 每段保存 `{opacity,tone,feather,theme}`，Host 端统一 clamp/取舍并按键合并。**视频必须支持真 Range**：`<video loop>` 每圈都会重新发 `Range: bytes=0-`，只声明 `accept-ranges` 却永远回 200 全长会让它反复重下整片。`streamFile(full, res, req)` 解析单段 Range（`bytes=a-b` / `bytes=a-` / `bytes=-n`），无法满足的单段回 `416` + `content-range: bytes */size`，多段或非法头忽略（回 200 全长）；`MIME` 表含 `webm: video/webm` / `mp4: video/mp4`（`parseRange` 是导出的纯函数，有单测）。
- `/dsh-tarkov/status-texts`：状态行文案池，**每次请求现读** `assets/status/texts.<lang>.txt`（改文件只需刷新页面，不重启）；`parseStatusTexts` 做 trim / 去注释 / 去重 / 长度与条数上限，池全空时返回 `enabled: false`，浏览器端据此保持原生文案。
- `/dsh-tarkov/status-poll`：状态行节奏计数器——非子代理会话的每个 `step/end` 让 `statusSeq` +1，浏览器端轮询它，序号一动就换一句（client 侧没有会话事件流，计数只能放在 host）。
- 插件列表图标（`package.json` 的 `icon`）不经过任何插件路由：DSH 的 `readPluginMeta` 直接读包内文件并转 data URL，所以插件半区无需为它注册端点。
- 设置页策略：≤0.1.6 注册 settings 命名空间（空 schema）使浏览器卡片出现在「插件配置」页；0.1.7 起该命名空间注册表已移除（服务只剩实例级页面策略），改为 `configure({ auto: false }, ctx.fiber)` 声明「本插件自带页面」，卡片则改由 Client 侧注册 `plugins.bundle.config`。两条路径用 `typeof … === 'function'` 特性探测并存，旧版行不受影响。

### Client 半区（`lib/client.js`，直接编辑，无需打包）

- 横幅：MutationObserver 观察 hero 选项行（`[class*='_heroWorkspaceRow']`）后注入；**写 DOM 前先比较值**——无条件的 `textContent` 赋值会对稳定的字符串产生 childList mutation 记录，形成「赋值 → mutation → 再赋值」的自反馈死循环（曾导致页面卡在 "Loading plugins…"）。
- BGM：多标签页通过 localStorage 心跳（12s 超时）选举唯一 leader，BroadcastChannel 转发控制命令；被禁用的曲目从播放列表过滤，若正在播放会立即停止。
- 桌宠：`body` 直挂 + MutationObserver 守灵（dsh 首屏 React 会清 body 直挂节点）；指针交互三件套——`setPointerCapture`（绑自身，勿绑祖先）+ 6px 位移阈值区分点击/拖动 + `pointercancel`/`lostpointercapture` 清理；位置存 localStorage（恢复时钳位到当前视口，防大屏位置不可达）；点击 = `<350ms` 且未移动，随机语音经 Web Audio 解码播放（buffer 按 id 缓存，上限 12 条）；右键菜单行在 root 内，pointerdown 对菜单区域 return，否则 setPointerCapture 会把菜单点击截胡成戳。
- 动态背景：`#tarkov-bg-layer`（`position:fixed;inset:0;z-index:-1;pointer-events:none`）**prepend 到 body**，内含 `<video muted loop playsinline autoplay preload="metadata" poster>`（reduced-motion 时换成 `<img>`）和 `#tarkov-bg-tint`。**取景**用 `object-view-box`（Chromium 104+，支持 video）把方形源裁成每段的 16:9 矩形，再由 `object-fit:cover` 铺满；不支持时退化为 `object-position` 平移。**遮罩**是 `#tarkov-bg-tint` 上的全屏水平渐变：`--tk-half` = `--tarkov-chat-width / 2 + 32px`，平台中心由 `--tarkov-chat-center` 控制，中心 alpha 由「遮罩强度」控制，边缘固定为一半，整屏都有覆盖。`syncChatMetrics()` 测量主会话 `[data-conversation-scroll] [class*="_column"]` 的实际 `left + width/2`（退化时才用 `--dsh-chat-content-width` 与视口中心），同时把宽度和中心写到 `<html>`；`MutationObserver` 节流 80ms，并观察布局 frame 的 `style/class/data-animating`，在侧栏/右栏开合动画期间补测 4 次（120/280/520/760ms），所以中心会跟着文本走。`data-content-phase="hero"` 时 `data-tarkov-phase="hero"`，tint 透明度过渡到 0，新对话完整显示背景。渐隐带宽度由面板的 `feather`（vw，0–12，默认 6）控制：`--tk-feather:min(calc(var(--tk-feather-vw,6) * 1vw),240px)`。**表面**只把 `--dsw-alias-bg-base` 设成 0 alpha、`--dsw-specific-sidebar-fill` 设成 0.20 alpha；卡片/弹窗继续用 `bg-layer-*` 不透明。中心平台与边缘各占一半；渐隐带宽度按背景保存，0 为硬边。**绝不要给 `#root` 加 `z-index` 或非 none 的 `backdrop-filter`**：那会给所有 fixed 后代建层叠上下文，第三方 `z-index:40` 面板会盖住官方 `z-index:1000` 的设置弹窗。门控：窄屏（≤768px）与 `prefers-reduced-transparency: reduce` 下**既不建图层也不改 token**；`prefers-reduced-motion: reduce` 只显示当前片段海报；非 leader 标签页 `pause()` 停解码（复用 BGM 的选举）；被首屏清掉时由桌宠那个 MutationObserver 顺带重新 prepend。
- 状态行：包装 `locale.translate`，拦下 `chat` 命名空间的运行文案键——`chat.deepDiving`（隐藏的无障碍播报节点；≤0.1.6 时它就是用户看到的句子）与**可见的运行文案键**：0.2.0 起是 `chat.deepDivingFor`、0.1.7 是 `message.turnProcess.deepDivingFor`，两者都带本地化的 `{duration}` 参数，都返回池中随机句；三个键同时保留在拦截表里，**同一个包兼容新旧 DSH**。判定还接受「不带命名空间前缀」的调用形状（`translate('chat','deepDivingFor')`），免得键名写法一变就整体失效。之所以要包装：**公开 locale API 覆盖不了内置文案**（同命名空间+同语言二次注册会抛 `locale namespace "chat" already has locale "zh"`），包装实例方法才能同时命中 ui-chat 自己的 `t`（`ctx.locale.bind('chat')`）和 slot 注入的 `t` 席位。`{duration}` 按上表规则注入，播报键不带时长、因此返回裸句，同一轮内两条路径文案一致。换句由三路只读信号共同驱动、合并进同一个 `reshuffle` 标志：① `[role="status"][aria-live]` 新增节点（新一轮开始）；② 状态行的**兄弟节点**新增（消息流又渲染了一步，不依赖 host，旧 host 也能用；0.1.7 起状态行节点嵌在运行行内部、子节点是静态的，这一路基本静默，仅作辅助）；③ 轮询 `/dsh-tarkov/status-poll`（host 的 `step/end` 计数，主信号，覆盖纯思考阶段）。全程不写 DOM，不碰耗时显示。locale 服务经 `ctx.inject(['locale'], …)` 作为**可选依赖**获取，缺失时静默不接管，不影响横幅/音乐/桌宠。
- 设置卡片：注册 `plugins.bundle.config`（**key = npm 包名 `dsh-theme-tarkov`**），卡片渲染在该 bundle 页的 `view: 'page'` 位置（`view: 'summary'` 返回 null，列表一行说明由包描述承担）。卡片**默认展开**（这页就是本插件专属的配置面，折叠等于把全部控件藏起来）。0.1.7 之前该席位不存在，旧行的卡片走 host 命名空间 + `settings.plugin.item`。卡片外壳与字段样式复刻原生 PluginCard / fields 的 CSS token（`--dsw-alias-*`），根元素是普通 `div`（不再假设自己在 `<ul>` 列表里）。
- 插件列表图标：由 `package.json` 的 **`icon`** 字段声明，DSH 的 `readPluginMeta`（`dsh-app-boot`，`ctx.pluginPackages.metaOf`）把它读成 data URL 交给插件页渲染。硬规则（违反则**静默回退默认图标**并附诊断）：必须是**相对路径**（绝对路径/URL 前缀直接抛错）、扩展名限 **svg / png / jpg / jpeg / webp**、**原始字节 ≤ 256 KiB**、realpath 后仍留在 package.json 所在目录内。本插件的 `assets/icon.png`（256×256、137.5 KiB）由 `assets/pet/altyn.png` 居中裁切头部生成，所以**换桌宠皮肤不会换图标**（图标是独立资产）。`metaOf` 每次调用都重新读盘，**改图标刷新页面即可，无需重启**。
- 窄屏适配：断点沿用 BGM 浮窗已有的 `@media (max-width:768px)`。横幅的两行用 `display:-webkit-box` + `-webkit-line-clamp:2`（同时写标准 `line-clamp`）**硬保证**，而不是靠字号精算——实测 408px 视口下文本列只有约 256px，浏览器还可能做 5%~15% 的字体放大。桌宠是「CSS 隐藏」**加**「`matchMedia` 门控」（`syncPetFromPrefs()` 在窄屏直接 `destroyPetUi()` 不建 DOM）：只写 CSS 的话窄屏仍会下载 331KB 的 altyn.png，`resize` 还会把记忆坐标按窄视口重新钳位、回到大屏时位置被改小。

### 测试

- `tests/notify.test.mjs`：事件分类（含 `tool/result` 失败与取消豁免）、入队状态机（approval 配对静音 + **每次工具失败都入队、突发只受 `MAX_PENDING` 限制**）、prefs 校验（含 `bg` 组、`bg.clip`、`bg.crops` 的 16:9 归一化与逐片段合并、`bg.perClip` 的强度/明暗/渐隐/主题校验）；
- `tests/status-keys.test.mjs`：状态行键表覆盖新旧三个键、**与本机安装的 DSH ui-chat 包对账**（把该包引用的每个 `chat.deepDiving*` 字面量与拦截表比对，装了 DSH 才跑、CI 跳过）、以及经 `apply()` 的包装接线（0.2.0 可见键 + 耗时、`{duration}` 版本、透传、dispose 还原）；
- `tests/host-routes.test.mjs`：host 路由集成测试（隔离 DSH_HOME，不碰真实数据）——曲库合并、添加/删除、流式播放、桌宠语音库合并/播放/防穿越/皮肤回退、pet prefs 校验、**`parseRange` 单测 + 背景库（4 段清单/auto 本地优先/显式选中/user 越权/206/416/后缀范围/无 Range 全长/海报 JPEG/裁剪合并/门控挂卸）**；
- `tests/status-texts.test.mjs`：文案池解析（注释/空行/去重/上限）、client 包装（步内稳定、步进换句、兄弟节点换句、可见键与 `{duration}` 注入、语言回落、透传、dispose 还原）、host 路由内容、`step/end` 计数（子代理不计）、0.1.7 settings 页面策略（`configure({ auto: false })` 恰好一次）；
- `tests/package-meta.test.mjs`：图标元信息（相对路径 / 扩展名 / ≤256 KiB / PNG 签名 / `files` 覆盖），以及**内置媒体的存在与签名**（4 段 webm EBML 魔数且每段 <2.5 MiB、4 张 16:9 crop 海报 JPEG、总库 <5 MiB、tool_error.m4a 的 `ftyp`）；
- `tests/client-smoke.mjs`：client 初始化与 apply() 冒烟；
- `tests/narrow-screen.test.mjs`：窄屏断点与两行 clamp 的 CSS 断言、背景层/全屏 tint/hero 淡出/宽度变量的 CSS 断言，以及「窄屏不构建桌宠（不请求 altyn.png）、宽屏照旧」「**背景默认不建图层不改 token / 宽屏开启后建 video + tint 并调用 `overrideTokens`（canvas 透明、侧栏 0.20）/ 窄屏即使开启也不建**」「会话宽度、对话列中心与 hero phase 写到 `<html>`」「按背景保存的强度/明暗/渐隐/主题能恢复」「输入框状态行（`data-composer-dock`）的卡片选择器与不改变文字位置的 padding/负 margin」的门控断言。

## 开发

```bash
pnpm install          # 安装 esbuild / @deepseek-ai/schemastery（dev 依赖）
pnpm run build        # 打包 src/index.js → lib/index.js（内联第三方依赖为自包含产物）
node --check lib/index.js && node --check lib/client.js   # 语法检查
node tests/notify.test.mjs && node tests/status-keys.test.mjs && node tests/host-routes.test.mjs && node tests/status-texts.test.mjs && node tests/package-meta.test.mjs && node tests/client-smoke.mjs && node tests/narrow-screen.test.mjs   # 等价于 pnpm test
```

本地开发直接用上面的「安装」link 方式（clone 后改代码，重启 dsh web 生效）。

### 发版（维护者）

发布已启用 npmjs **Trusted Publishing**（GitHub Actions OIDC，无需 npm token，见 `.github/workflows/npm-publish.yml`，推送 `v*` 标签自动构建、测试并发布，自动生成 provenance）：

```bash
npm version patch -m "release v%s" && git push --follow-tags
```

注意：

- Host 源码在 `src/index.js`，改动后必须 `pnpm run build` 再重启 dsh web；
- Client 半区直接改 `lib/client.js`（`__ModuleLoader__` 格式即运行时契约，无需打包）；
- link 安装的插件 Host 半区**无法解析第三方包**（Node 按 realpath 解析），所以产物必须由 esbuild 内联为自包含。

## 已知限制

- 横幅锚定 hero 选项行的 hash 类名（`[class*='_heroWorkspaceRow']`），Web UI 结构重大重构时需随版本维护。
- 320px 级超窄屏下，横幅两段文本仍会以省略号收尾——这是 `line-clamp` 的预期行为，「两行以内」优先于「完整显示」；340px 及以上实测都能完整排进两行。
- 状态行文案依赖 DSH 内部的 `locale.translate` 实例方法、运行文案的 locale 键名（`chat.deepDiving` / `chat.deepDivingFor` / `message.turnProcess.deepDivingFor`）、`[role="status"][aria-live]` 节点形状与 `step/end` 会话事件：拿不到这些形状时插件静默不接管（显示原生文案），DSH 大版本升级后需复核。**这件事已经发生过两次**：0.1.7 把可见运行文案从 `chat.deepDiving` 换成带 `{duration}` 的 `message.turnProcess.deepDivingFor`，0.2.0 又换成同样带 `{duration}` 的 `chat.deepDivingFor`——每次只拦旧键都会让随机文案"消失"（界面无任何报错）。`tests/status-keys.test.mjs` 会在本机装了 DSH 时自动把拦截表和 ui-chat 包里的键字面量对账，升级后跑一次 `pnpm test` 即可提前发现。
- 状态行换句的第②路 DOM 信号（状态行兄弟节点新增）语义最弱（0.1.7 起运行行内部结构是静态的），主信号是 host 的 `step/end` 计数，host 不可用时才依赖它。
- 动态背景的取景依赖浏览器 `object-view-box`（Chromium 104+，DSH Web/Desktop 满足）；不支持的浏览器会退化为只按 `object-position` 平移、不能缩放，并在取景编辑器里提示。
- 宽度剖面依赖 DSH 内部契约：主会话容器的 `[data-conversation-content]`、`data-content-phase`（`hero` / `settling` / `active`）与 `--dsh-chat-content-width`。这些不是公开 API；DSH 重构后若改名，遮罩会退回“全屏均匀 + 默认 720px”而不是报错，需要随版本复核。
- 遮罩会同时压低画布与侧栏：`--dsw-alias-bg-base` 为 0 alpha，`--dsw-specific-sidebar-fill` 为 0.20 alpha。**第三方皮肤若把 `bg-base` 当卡片底色用**，那些表面也会透出背景；卡片/弹窗走 `bg-layer-*`，保持不透明。关掉功能即完全还原（token 层 dispose）。
- “遮罩强度”下限是 0：0 等于完全透视；可读性靠中心/边缘剖面、卡片自身边框与主题明暗。深色片段建议搭配深色模式（面板有提示，但不强制）。


## 卸载

```bash
dsh plugin --profile web remove dsh-theme-tarkov
```

`dsh plugin rm/remove` 会从 profile 的 `dsh.profile.bundles` 移除本包，包内 `cordis.patch.yml` 由 bundle 层自动应用并随之卸载，无需手动清理。link 方式安装的克隆目录可一并删除。

## License

MIT
