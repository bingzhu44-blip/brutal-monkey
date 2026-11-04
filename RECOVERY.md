# 恢复与回滚

本文件记录"代码丢了怎么救回来"。2026-11-04 实际发生过一次：本地目录被 npm 包内容覆盖，`.git` 与 `scripts/` 全部丢失。

## 三条独立的备份线

| 位置 | 内容 | 前提 |
|---|---|---|
| GitHub `bingzhu44-blip/brutal-monkey` | 全部提交历史、`scripts/`、文档 | VPN 开着 |
| npm `dsh-brutal-delete@1.0.1` | 可运行产物（7 个文件） | VPN 开着 |
| `D:\DSH备份\*.tar.gz` | 含 `.git` 的完整快照 | 本机，无需网络 |

## 情况一：本地目录被覆盖，但 GitHub 有最新提交

```powershell
$tmp = "$env:TEMP\brutal-restore"
git clone https://github.com/bingzhu44-blip/brutal-monkey.git $tmp
$dev = "D:\DeepSeek Harness\工作区\一号\dsh-session-delete"
Copy-Item "$tmp\.git" -Destination $dev -Recurse -Force
git -C $dev config core.autocrlf false
git -C $dev checkout -- .
Remove-Item $tmp -Recurse -Force
```

`checkout -- .` 会把缺失和被覆盖的文件按当前提交还原。执行后 `git status` 应为空。

## 情况二：GitHub 也连不上，只有本机备份

```powershell
tar -xzf "D:\DSH备份\最新那个.tar.gz" -C "D:\DeepSeek Harness\工作区\一号"
```

## 情况三：运行中的插件坏了，要立刻回到稳定版

profile 里装的是 npm 版（`^1.0.1`），与开发仓库隔离。重装即可：

```powershell
dsh plugin --profile desktop add dsh-brutal-delete
```

## 自检

改完代码、发布前必须跑：

```powershell
cd "D:\DeepSeek Harness\工作区\一号\dsh-session-delete"
& "D:\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe" scripts\verify.mjs
```

输出「全部通过 ✓」才允许发布。

## 不要做

- 不要把 `node_modules` 里解压出来的包内容覆盖回开发仓库——这正是本次事故的原因。
- 不要在开发仓库目录里执行 `pnpm add` 或解压 tarball。
- 不建议把运行环境切回 `link:` 指向开发仓库，稳定版与开发版应保持隔离。
