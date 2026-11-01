# npm 发布 · 你只需做 3 步

> 说明：`www.npmjs.com` 被 Cloudflare 人机验证挡住（`cf-mitigated: challenge`），
> 程序无法通过验证码，注册和生成 token 必须由你在真实浏览器里操作。
> 其余所有步骤都已自动化，见下方脚本。

---

## 第 1 步：注册 npm 账号（约 1 分钟）

打开浏览器访问：

    https://www.npmjs.com/signup

填写：用户名、邮箱、密码 → 注册 → 到邮箱点验证链接。

> 如果页面显示「Just a moment...」转圈，等 5 秒即可通过（这是正常的浏览器验证，
> 只是程序过不去，人在浏览器里打开是正常的）。
>
> 如果一直转圈：更换 VPN 节点，或改用手机热点再试。

---

## 第 2 步：生成 Automation Token（约 30 秒）

打开：

    https://www.npmjs.com/settings/~/tokens

1. 点 **Generate New Token**
2. 选择 **Automation**（不要选 Classic / Granular，Automation 免 2FA 交互）
3. 点 **Generate Token**
4. **复制** 生成的字符串（形如 `npm_AbCdEf123456...`，只显示一次）

---

## 第 3 步：运行发布脚本（约 20 秒）

在本机打开 PowerShell，粘贴执行（把 `npm_xxx` 换成你的 token）：

```powershell
$env:NPM_TOKEN = "npm_你复制的token"
cd "D:\DeepSeek Harness\工作区\一号\dsh-session-delete"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\publish-npm.ps1
```

脚本会自动完成：

- 验证 token 有效性
- 检查 registry 连通性
- 确认包名 `dsh-brutal-delete` 未被占用
- 执行发布
- 验证发布结果并打印包地址

成功后会输出：

```
[OK] 发布成功！
     latest = 1.0.1
     页面   = https://www.npmjs.com/package/dsh-brutal-delete
```

---

## 或者：把 token 发给我

你也可以把 token 直接发给我，我立刻执行发布并验证。
（token 形如 `npm_` 开头约 36+ 字符）

> 安全提示：Automation Token 拥有发布权限，用完可以在
> https://www.npmjs.com/settings/~/tokens 删除或轮换。

---

## 发布后效果

| 渠道 | 命令 |
|---|---|
| 插件市场 | 市场内搜索 `dsh暴力删除` |
| GitHub | `dsh plugin --profile desktop add github:bingzhu44-blip/brutal-monkey` |
| **npm（新增）** | `dsh plugin --profile desktop add dsh-brutal-delete` |

npm 上架后还会出现在：
- https://www.npmjs.com/package/dsh-brutal-delete
- npm 搜索「dsh brutal delete」的结果里
- 插件市场条目的 `npm` 字段（市场会自动抓取版本号和下载量）

---

## 已完成的准备工作（无需你做）

- ✅ 包名 `dsh-brutal-delete` 确认可用
- ✅ 发布包已打包验证（7 个文件，16.7 KB）
- ✅ `package.json` 的 `publishConfig` 就绪
- ✅ 发布脚本 `scripts/publish-npm.ps1` 已测试
- ✅ LICENSE、README、repository 字段齐全
- ✅ 版本 1.0.1
