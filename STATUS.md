# dsh暴力删除 · 上线状态与后续操作

> 更新时间：2026-11-01

---

## 一、已完成（市场已上架）

| 项 | 状态 | 说明 |
|---|---|---|
| 插件开发 | ✅ | 单条删除 / 跨工作区批量删除 / Ctrl+A / Delete 快捷键 |
| GitHub 仓库 | ✅ | https://github.com/bingzhu44-blip/brutal-monkey |
| 仓库 topics | ✅ | 12 个（dsh-plugin、deepseek-harness、session 等） |
| **插件市场收录** | ✅ **已上架** | PR #9302 于 2026-10-26 合并 |
| 市场详情页 | ✅ 可访问 | https://awesome-dsh-plugin.com/p/bingzhu44-blip/brutal-monkey/ |
| 市场索引 `plugins.json` | ✅ 已收录 | `"added": "2026-10-26"`，category `session` |
| README | ✅ 已更新 | 含市场徽章、市场链接、四种安装方式 |
| 仓库描述 + homepage | ✅ 已更新 | 指向市场详情页 |
| npm 发布脚本 | ✅ 已就绪 | `scripts/publish-npm.ps1` |
| npm 安装包 | ✅ 已打包 | `dsh-brutal-delete-1.0.1.tgz`（7 个文件） |

### 市场中的安装命令

```bash
dsh plugin --profile web add github:bingzhu44-blip/brutal-monkey
```

市场搜索词：**`dsh暴力删除`** 或 **`brutal-monkey`**

---

## 二、待办（需要 VPN）

当前网络受限：`registry.npmjs.org`、`github.com` 均无法连接，
但 `awesome-dsh-plugin.com` 可访问（说明市场本身没问题）。

### 待办 1：npm 发布

**目的**：让插件支持 `dsh plugin add dsh-brutal-delete` 安装，并出现在 npm 搜索中。

**步骤**：

1. 开 VPN
2. 打开 https://www.npmjs.com/signup 注册账号（若已有则登录）
3. 打开 https://www.npmjs.com/settings/~/tokens
4. 点 **Generate New Token** → 选 **Automation** → 复制 token（形如 `npm_xxxx`）
5. 在本机任意 PowerShell 窗口执行：

   ```powershell
   $env:NPM_TOKEN = "npm_你复制的token"
   cd "D:\DeepSeek Harness\工作区\一号\dsh-session-delete"
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\publish-npm.ps1
   ```

脚本会自动：检查 token → 检查网络 → 检查包名 → 发布 → 验证。

> 注意：系统里**没有独立的 npm**，脚本用 DSH 自带的 node + pnpm 发布，无需额外安装。

### 待办 2：推送本地未同步的 commit

git 走 `127.0.0.1` 代理，当前不通。VPN 恢复后执行：

```bash
cd "D:\DeepSeek Harness\工作区\一号\dsh-session-delete"
git push origin main
```

本地领先远端的 commit：
- `50d0a69` 新增 publish-npm.ps1
- `d94be87` README 更新（内容已通过 API 推送到远端 `452a9d4`，内容等价）

---

## 三、附：三层命名（避免混淆）

| 层 | 值 | 用户可见 | 说明 |
|---|---|---|---|
| 市场显示名 | **dsh暴力删除** | ✅ | 市场条目中文描述开头 |
| GitHub 仓库 | `brutal-monkey` | ✅ | 暴力猴的 ASCII 化 |
| npm 包名 | `dsh-brutal-delete` | ⚠️ | 技术标识，npm 不允许中文 |
| 插件 id | `dsh-brutal-delete` | ❌ | 内部标识，改了就加载失败 |
| 侧栏菜单文字 | 永久删除 / 批量删除 | ✅ | 功能按钮文字 |

> ⚠️ 插件 id 与 npm 包名**不能用中文**，这是 npm / 模块系统的硬性限制。
> 用户看到的一切（市场名、仓库名、菜单）都可以是中文。

---

## 四、权限能力（市场标注）

| 能力 | 含义 | 为何需要 |
|---|---|---|
| `fs-write` | 写磁盘 | 删除会话文件 |
| `fs-read` | 读磁盘 | 定位会话文件 |
| `network` | 网络 | 客户端与宿主通信 |
| `env` | 环境变量 | 定位 DSH 数据目录 |

`capabilityRedLines` 为空 —— 无安全红线。
