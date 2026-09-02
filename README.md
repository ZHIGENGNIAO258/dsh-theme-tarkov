# dsh-theme-tarkov

以《逃离塔科夫》（Escape from Tarkov）主界面为灵感的 DeepSeek Harness（DSH）Web 界面主题插件：Beta 警告横幅、提示音、背景音乐，全部功能可在设置面板中统一调整。

## 功能

- **新对话横幅**：为新对话界面添加塔科夫风格的 Beta 测试横幅，文案与透明度可在设置中调整。
- **提示音**：会话完成、请求确认、中断失败时播放对应音效；后台标签页也会响；三种场景都可以换成你自己的音频。
- **背景音乐**：右下角浮窗播放器，内置塔科夫 BGM 曲库，也可添加自己的音乐；多个标签页同时打开时，只有同一个标签页在播放。
- **设置面板**：设置 → 插件 → 插件配置 →「塔科夫主题」，开启/关闭各功能、调整音量与横幅透明度、管理音乐曲库（添加 / 删除 / 禁用）。

## 音频文件放在哪里

| 位置 | 内容 |
| --- | --- |
| `assets/music/`（插件包内） | 内置曲目（128kbps mp3，约 40MB）随插件提供；可在设置中「删除」——仅从曲库列表移出（记录在 prefs），可一键恢复，不删包内文件 |
| `~/.dsh/dsh-tarkov/music/` | 你自己的音乐：**直接把音频文件丢进去即可**（mp3 / wav / ogg / m4a / aac / flac），或在设置面板点「添加音乐」上传（上限 200MB）。与内置曲目同名时，你的文件优先播放 |
| `~/.dsh/dsh-tarkov/sounds/` | 提示音：首次启动时从插件复制出来，直接替换同名文件（done.m4a / approval.m4a / error.m4a）即可换音效 |
| `~/.dsh/dsh-tarkov/prefs.json` | 全部设置（音量、透明度、语音开关、禁用曲目等） |

## 技术实现（维护参考）

### Host 半区（`src/index.js` → esbuild 打包为自包含 `lib/index.js`）

- `/dsh-tarkov/prefs`：设置的读写；PUT 按字段合并，浏览器端自定义提示音以 dataURL 存储（单文件上限 2MB）。
- `/dsh-tarkov/sfx-poll` + `/dsh-tarkov/sfx`：提示音队列与音频服务；`classifySessionEvent` / `createSfxState` 完成事件分类与去重（`approval/asked → decided` 配对，只响一次；子代理会话不触发）。
- 曲目库：`assets/music`（内置，128kbps mp3）+ `~/.dsh/dsh-tarkov/music`（用户）按**文件名（不含扩展名）**合并，同名用户文件优先，内置曲目标记 `builtin`。
- `/dsh-tarkov/music`（曲目列表）、`/dsh-tarkov/music/add`（原始字节流式上传）、`/dsh-tarkov/music/delete`（用户文件删除磁盘文件；内置曲目写入 `music.removed` 从列表移除，可通过恢复按钮清除）、`/dsh-tarkov/audio`（流式播放）。
- 注册 settings 命名空间（空 schema）使浏览器卡片出现在插件配置页。

### Client 半区（`lib/client.js`，直接编辑，无需打包）

- 横幅：MutationObserver 观察 hero 选项行（`[class*='_heroWorkspaceRow']`）后注入；**写 DOM 前先比较值**——无条件的 `textContent` 赋值会对稳定的字符串产生 childList mutation 记录，形成「赋值 → mutation → 再赋值」的自反馈死循环（曾导致页面卡在 “Loading plugins…”）。
- BGM：多标签页通过 localStorage 心跳（12s 超时）选举唯一 leader，BroadcastChannel 转发控制命令；被禁用的曲目从播放列表过滤，若正在播放会立即停止。
- 设置卡片：注册 `settings.plugin.item`（key = host 命名空间），卡片外壳与字段样式复刻原生 PluginCard / fields 的 CSS token（`--dsw-alias-*`）。

### 测试

- `tests/notify.test.mjs`：事件分类、去重状态机、prefs 校验；
- `tests/host-routes.test.mjs`：host 路由集成测试（隔离 DSH_HOME，不碰真实数据）——曲库合并、添加/删除、流式播放；
- `tests/client-smoke.mjs`：client 初始化与 apply() 冒烟。

## 安装

```bash
dsh plugin --profile web add dsh-theme-tarkov
# 本地开发（link 方式，改代码后重启 dsh web 生效）
dsh plugin --profile web add link:D:\DSH-workspace\dsh-theme-tarkov
```

`dsh plugin add` 会把本包加入 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles`，bundle 层**自动应用**包内 `cordis.patch.yml`（即插件行 `id: tarkov`）。重启 dsh web 即生效。

> ⚠️ 不要手动在 `~/.dsh/profiles/web/cordis.patch.yml` 里再次 insert `id: tarkov`——bundle 层已注册一次，重复 id 会触发 `duplicate loader entry id: tarkov`，dsh web 启动即崩溃（2026-09-02 踩坑）。README 中"手动挂补丁行"的步骤仅适用于不经过 `add` 命令、手动把包放入 node_modules 的旧安装路径。

## 开发

```bash
pnpm install          # 安装 esbuild / @deepseek-ai/schemastery（dev 依赖）
pnpm run build        # 打包 src/index.js → lib/index.js（内联第三方依赖为自包含产物）
node --check lib/index.js && node --check lib/client.js   # 语法检查
node tests/notify.test.mjs && node tests/host-routes.test.mjs && node tests/client-smoke.mjs
```

注意：

- Host 源码在 `src/index.js`，改动后必须 `pnpm run build` 再重启 dsh web；
- Client 半区直接改 `lib/client.js`（`__ModuleLoader__` 格式即运行时契约，无需打包）；
- link 安装的插件 Host 半区**无法解析第三方包**（Node 按 realpath 解析），所以产物必须由 esbuild 内联自包含；
- 沙箱受限环境下 esbuild 会因无法 spawn 子进程而失败，需完整权限运行。

## 已知限制

- 横幅锚定 hero 选项行的 hash 类名（`[class*='_heroWorkspaceRow']`），Web UI 结构重大重构时需随版本维护。

## 卸载

```bash
dsh plugin --profile web remove dsh-theme-tarkov
```

注意：`dsh plugin rm/remove` 会从 profile 的 `dsh.profile.bundles` 移除本包，包内 `cordis.patch.yml` 由 bundle 层自动应用并随之卸载，无需手动清理。若曾在 `~/.dsh/profiles/web/cordis.patch.yml` 里手动插入过 `id: tarkov`（旧路径，不符合规范），需删掉该行再重启。

## License

MIT
