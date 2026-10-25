# 发布流程 · Release Checklist

本文档是维护者备忘，记录把「暴力删齐」插件正式发布到 npm + GitHub + DSH 插件市场所需的全部步骤。

---

## 0. 现状

| 项 | 状态 |
|---|---|
| 包名 | `dsh-brutal-delete`（npm 上未被占用） |
| 仓库 | https://github.com/bingzhu44-blip/brutal-monkey |
| 版本 | `1.0.0` |
| 代码推送 | ✅ |
| npm 发布 | ❌ 待 token |
| 市场收录 | ❌ 待提交 |

---

## 1. 发布到 npm

npm 网页（`www.npmjs.com`）在部分网络环境会被 Cloudflare 拦截（HTTP 403），
但 **发布用的 `registry.npmjs.org` 完全正常**。因此只要拿到 token 即可发布。

### 1.1 获取 token（任选其一）

**方式 A · 网页（需能访问 npmjs.com）**

1. 注册/登录 https://www.npmjs.com
2. 头像 → **Access Tokens** → **Generate New Token**
3. 类型选 **Classic Token** → **Automation**
4. 复制 `npm_xxxxxxxx`

**方式 B · 命令行（不需要网页）**

```bash
npm login --auth-type=web     # 浏览器 OAuth
# 或
npm login                     # 传统用户名/密码方式
```

**方式 C · 换网络**：手机热点 / VPN 打开 npmjs.com 注册

### 1.2 发布

```bash
# 用 token
NPM_TOKEN=npm_xxxxxxxx bash scripts/publish.sh

# 或已 npm login
bash scripts/publish.sh
```

脚本会自动：语法检查 → 版本一致性检查 → 包名占用检查 → 发布。

### 1.3 验证

```bash
npm view dsh-brutal-delete version
curl -s https://registry.npmjs.org/dsh-brutal-delete | head -c 300
```

---

## 2. 市场收录（awesome-dsh-plugin）

市场索引仓库：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin

**提交方式：不是编辑 README**（README 是自动生成的），而是**新增一个 YAML 文件**：

```
data/plugins/bingzhu44-blip__brutal-monkey.yml
```

内容已备好，见仓库根目录 `.market-entry.yml`，直接复制即可：

```yaml
url: https://github.com/bingzhu44-blip/brutal-monkey
name: bingzhu44-blip/brutal-monkey
category: session
description:
  en: 'Brutal Monkey permanently deletes DSH sessions from disk — single-row or cross-workspace bulk delete, with Ctrl+A select-all and Delete shortcut, wiping transcripts, projection cache, workspace slots, attachments and subagent data. Irreversible.'
  zh: '暴力猴：永久删除 DSH 会话的磁盘数据——单条删除或跨工作区批量删除，支持 Ctrl+A 全选与 Delete 快捷删除，彻底清理对话记录、投影缓存、工作区归属、附件与子会话，不可恢复。'
```

### 2.1 三个硬门槛

| 门槛 | 当前 | 处理 |
|---|---|---|
| `package.json` 声明 `dsh.bundle` | ✅ 已有 | — |
| 仓库创建 ≥ **1 天** | ❌ 新建 | **等到 2026-10-26 之后** |
| 仓库带 `dsh-plugin` topic | ❌ 未设 | 见下方 2.2 |

### 2.2 设置 topic（1 分钟）

1. 打开 https://github.com/bingzhu44-blip/brutal-monkey
2. 点右侧 **⚙️**（About 旁的齿轮）
3. **Topics** 填：`dsh-plugin` `deepseek` `harness` `session` `delete`
4. Save

### 2.3 提交 PR

```bash
# fork + clone 后
cd awesome-dsh-plugin
cp /path/to/.market-entry.yml data/plugins/bingzhu44-blip__brutal-monkey.yml
git checkout -b add-brutal-monkey
git add data/plugins/bingzhu44-blip__brutal-monkey.yml
git commit -m "Add bingzhu44-blip/brutal-monkey (session)"
git push origin add-brutal-monkey
```

然后在 GitHub 上开 PR。

> ⚠️ 描述中含 `: `（冒号+空格）时 YAML 必须加引号——本文件已用单引号包裹。

---

## 3. 本地验证（发布前）

```bash
# 完整加载验证
node scripts/verify.mjs .

# 打包预览（确认发布内容无多余文件）
npm pack --dry-run
```

期望内容：`lib/`、`cordis.patch.yml`、`dsh.plugin.json`、`README.md`、`LICENSE`、`package.json`

---

## 4. 发版流程

```bash
# 1. 改版本号（两个文件必须一致）
#    package.json + dsh.plugin.json
npm version patch   # 或 minor / major

# 2. 同步 dsh.plugin.json 的 version
# 3. 提交 + 推送
git add -A && git commit -m "v1.0.1" && git push

# 4. 发布
NPM_TOKEN=... bash scripts/publish.sh
```

---

## 5. 常见问题

**Q：npm 网页打不开，能发布吗？**
能。网页只有「注册账号」需要，发布走 `registry.npmjs.org`，实测正常。

**Q：不发布 npm 能用吗？**
能，但只能从 GitHub 装：
```bash
dsh plugin --profile desktop add github:bingzhu44-blip/brutal-monkey
```
缺点：不出现在市场搜索里，且每次安装要下载整个仓库。

**Q：包名能改吗？**
发布前随便改。发布后改包名 = 新包，旧包需 `npm unpublish`。

**Q：中文仓库名为什么变成了 `-`？**
GitHub 会把部分中文字符规范化成 `-`，所以 `暴力猴` 变成了 `-`。建议用 ASCII 名（当前已是 `brutal-monkey`）。
