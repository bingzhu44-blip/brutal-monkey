# 暴力删除 · dsh-brutal-delete

> 给 DeepSeek Harness 侧栏加上「彻底删干净」的能力：**永久删除**会话的磁盘数据，不可恢复。

DSH 自带的「归档」只是把会话行藏起来，对话记录、投影缓存、附件全都原样留在硬盘上。
这个插件做的是**真删除**——把该会话在三处留下的所有东西一次性清空，删完没有任何残留。

---

## 为什么需要它

| | DSH 自带「归档」 | 暴力删除 |
|---|---|---|
| 侧栏不再显示 | ✅ | ✅ |
| 对话记录（`session.v4.jsonl.zstd`） | ❌ 仍占磁盘 | ✅ **删除** |
| 投影缓存（`session_projcache`） | ❌ 仍保留 | ✅ **删除** |
| 工作区归属记录（`workspace.json`） | ❌ 仍占槽位 | ✅ **解绑** |
| 附件目录（`attachments/`） | ❌ 仍保留 | ✅ **删除** |
| 子会话（subagent） | ❌ 仍保留 | ✅ **一并清理** |
| 可恢复 | ✅ | ❌ **不可恢复** |

---

## 功能

### 1. 单条删除

侧栏任意会话行的「⋯」菜单里多出一项 **「删除会话」**，位置在「归档会话」与「复制 session id」之间（`order: 425`）。

点击后弹出确认框，显示会话标题并明确告知不可撤销；确认即从磁盘彻底删除。

### 2. 跨工作区批量删除

单条确认框里，「永久删除」**右侧**新增 **「批量删除」** 按钮。点击后进入**批量选择模式**：

- 每条非归档会话名称**左侧出现白色空心圆点**
- 点击圆点（或整行）选中 / 取消选中，选中后圆点变**实心**
- 侧栏**左下角**出现三个按钮：**全选** · **删除 (N)** · **退出**

### 3. 全选与快捷删除

批量模式下支持键盘操作：

| 快捷键 | 作用 |
|---|---|
| `Ctrl + A` | 全选 / 取消全选 |
| `Delete` | 快速删除（弹确认框） |
| `Esc` | 退出批量模式 |

> 输入框内不触发，不会干扰正常打字。

全选覆盖**所有工作区**的会话——一次勾选、一次删完，不必逐个工作区切换。

### 4. 删除正在使用的会话

DSH 自身没有删除接口，插件自己实现了安全删除流程。**正在打开 / 运行中的会话同样可以删**：

Windows 上 JSONL 后端的写所有权锁是**命名内核信号量**，不是文件句柄，所以日志目录可以自由删除。删除前插件会：

1. 尽力停掉常驻 Agent（`cancel` + `whenIdle`，最长等 5 秒）
2. 强制 `flush` 写缓冲，避免它向已删目录继续追加
3. 再执行删除

### 5. 删除顺序

确认后宿主端依次执行：

1. 移除归档 / 置顶标记
2. 从工作区归属列表（`workspace.json` 的 `sessionIds`）解绑
3. 删除投影缓存记录（`storages/session_projcache/sessions/<id>.json`）
4. 删除会话日志目录 `sessions/<编码工作区>/<id>/` 与 `attachments/<id>`
5. 广播 `api-session/removed`，打开页面的列表行随之消失

子会话（subagent）在缓存可读时一并清理。

---

## 安装

### 方式一：插件市场（推荐）

在 DSH 插件市场中搜索 **`暴力删除`** 或 **`dsh-brutal-delete`**，一键安装。

### 方式二：命令行

```bash
dsh plugin --profile desktop add dsh-brutal-delete
```

### 方式三：本地开发

在本目录执行，然后在 `%DSH_HOME%\profiles\desktop\package.json` 里声明依赖：

```json
"dependencies": { "dsh-brutal-delete": "link:D:\\path\\to\\dsh-brutal-delete" }
```

并在 `%DSH_HOME%\profiles\desktop\cordis.patch.yml` 加入加载入口（profile 补丁层受 HMR 监视，改完即刻生效）：

```yaml
- insert:
    - id: dsh-brutal-delete
      name: dsh-brutal-delete
```

`node_modules\dsh-brutal-delete` 需指向本目录（junction 或 `pnpm install` 生成的链接）。

> 本包自带 `cordis.patch.yml`，也可以把 `dsh-brutal-delete` 加进 `dsh.profile.bundles`
> 用 bundle 机制加载。**二选一**，不要与上面的 profile 补丁条目同时启用，
> 否则同一 id 会被插入两次。

安装完成后**刷新页面**（或重启 DSH）。

---

## 卸载

```bash
dsh plugin --profile desktop remove dsh-brutal-delete
```

手动安装的用户：从 profile `package.json` 移除该依赖、从 `cordis.patch.yml` 删掉上面的 insert 条目、
删除 `node_modules\dsh-brutal-delete` 链接，然后刷新或重启。

> 卸载插件**不会**恢复任何已删除的会话。

---

## 接口

`POST /dsh-brutal-delete/delete`，body `{ "sessionId": "session-…" }`。
同源校验由 `ctx.connection.requestRejection` 完成。

| 状态 | code | 含义 |
|---|---|---|
| 400 | `invalid-id` / `invalid-body` | 非法 id 或 JSON |
| 403 | `forbidden` | 非同源请求被拒 |
| 404 | `not-found` | 会话不存在 |
| 500 | `delete-failed` | 列表已移除但文件删除失败 |

请求体上限 64 KB，单会话静默等待上限 5 秒。

---

## 安全说明

- 路由要求**同源**，第三方页面无法触发删除
- session id 严格校验 UUID 格式，不接受任意路径
- 所有破坏性操作前都有确认框，且明确标注不可撤销
- 删除过程分步、每步独立容错：单个文件失败不会中断整体流程，失败项会在结果框中列出

> ⚠️ **这是一把真刀。** 删除即彻底清除，没有回收站、没有备份、无法撤销。
> 归档会话与空白占位行不参与批量选择，避免误删。

---

## 兼容性

- DSH Desktop（Web UI），客户端 `platform: web`
- 依赖 `@deepseek-ai/dsh-client-ui-slots`、`dsh-api-session-controller`、`dsh-api-workspace-controller`
- 宿主端注入 `webServer`、`connection`、`workspaceRegistry`、`sessionProjectionCache`、`sessions`、`agents`、`sessionPersistence`

---

## License

MIT
