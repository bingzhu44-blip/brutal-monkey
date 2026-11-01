# npm 发布一键脚本（dsh暴力删除）
#
# 系统里没有独立的 npm，本脚本使用 DSH 自带的 node + pnpm 发布。
#
# 用法（VPN 已开）：
#   1. 到 npm 官网生成 Automation Token
#      https://www.npmjs.com/settings/~/tokens  →  Generate New Token → Automation
#   2. 在 PowerShell 里设置环境变量（不要写进文件）：
#        $env:NPM_TOKEN = "npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
#   3. 运行：
#        pwsh -File scripts\publish-npm.ps1
#
# 脚本做的事：检查 token → 检查网络 → 检查包名 → 发布 → 验证

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

# 定位 DSH 自带的 node + pnpm（系统里没有独立 npm）
# 按优先级逐个探测，第一个存在的即采用
$candidates = @()
if ($env:DSH_ROOT) { $candidates += $env:DSH_ROOT }
$candidates += "D:\DeepSeek Harness"

$base = $null
foreach ($h in $candidates) {
    $b = "$h\resources\runtime\primary-runtime\dependencies"
    if (Test-Path "$b\node\bin\node.exe") { $base = $b; break }
}
if (-not $base) {
    Write-Host "[X] 找不到 DSH 自带的 node，请手动设置 DSH_ROOT" -ForegroundColor Red
    Write-Host "    \$env:DSH_ROOT = `"你的安装目录`"（含 resources\runtime 的目录）" -ForegroundColor Yellow
    exit 1
}
$node = "$base\node\bin\node.exe"
$pnpm = "$base\pnpm\bin\pnpm.cjs"

Write-Host "=== dsh暴力删除 · npm 发布 ===" -ForegroundColor Cyan

# 0. 运行时自检
if (-not (Test-Path $node)) { Write-Host "[X] 找不到 node: $node" -ForegroundColor Red; exit 1 }
if (-not (Test-Path $pnpm)) { Write-Host "[X] 找不到 pnpm: $pnpm" -ForegroundColor Red; exit 1 }
Write-Host "[OK] node + pnpm 就绪" -ForegroundColor Green

# 1. token
if (-not $env:NPM_TOKEN) {
    Write-Host "[X] 未设置 NPM_TOKEN 环境变量" -ForegroundColor Red
    Write-Host "    1) 打开 https://www.npmjs.com/settings/~/tokens" -ForegroundColor Yellow
    Write-Host "    2) Generate New Token -> Automation" -ForegroundColor Yellow
    $hint = '    3) 在本窗口执行: $env:NPM_TOKEN = "npm_xxx"'
    Write-Host $hint -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] NPM_TOKEN 已设置 (长度 $($env:NPM_TOKEN.Length))" -ForegroundColor Green

# 2. 网络
Write-Host "[..] 检查 registry.npmjs.org ..."
try {
    $r = Invoke-WebRequest -Uri "https://registry.npmjs.org/-/whoami" `
        -Headers @{ Authorization = "Bearer $env:NPM_TOKEN" } -TimeoutSec 20 -UseBasicParsing
    $me = $r.Content | ConvertFrom-Json
    Write-Host "[OK] registry 可达，登录身份: $($me.username)" -ForegroundColor Green
} catch {
    $sc = 0
    if ($_.Exception.Response) { $sc = [int]$_.Exception.Response.StatusCode }
    if ($sc -eq 401) {
        Write-Host "[X] token 无效或已过期 (401)" -ForegroundColor Red
        exit 1
    }
    Write-Host "[X] 无法连接 registry.npmjs.org — VPN 开了吗？" -ForegroundColor Red
    Write-Host "    $($_.Exception.Message)" -ForegroundColor DarkGray
    exit 1
}

# 3. 包名
$pkg = Get-Content "$root\package.json" -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host "[..] 检查包名 $($pkg.name) ..."
$occupied = $false
try {
    $null = Invoke-WebRequest -Uri "https://registry.npmjs.org/$($pkg.name)" -TimeoutSec 20 -UseBasicParsing
    $occupied = $true
} catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) {
        Write-Host "[OK] 包名可用（未占用）" -ForegroundColor Green
    }
}
if ($occupied) {
    Write-Host "[!] $($pkg.name) 已存在于 npm — 将尝试发布新版本" -ForegroundColor Yellow
    Write-Host "    若报 403 说明不是你名下，需改 package.json 的 name" -ForegroundColor Yellow
}

# 4. 发布
Write-Host ""
Write-Host "[..] 发布 $($pkg.name)@$($pkg.version) ..." -ForegroundColor Cyan

$npmrc = "$root\.npmrc.publish"
$lines = @(
    "//registry.npmjs.org/:_authToken=$env:NPM_TOKEN",
    "registry=https://registry.npmjs.org/",
    "access=public"
)
$lines -join "`n" | Set-Content $npmrc -Encoding ASCII -NoNewline

try {
    Push-Location $root
    & $node $pnpm publish --no-git-checks --access public --userconfig $npmrc 2>&1 | ForEach-Object { Write-Host $_ }
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { throw "publish 退出码 $code" }
} finally {
    Remove-Item $npmrc -Force -ErrorAction SilentlyContinue
}

# 5. 验证
Write-Host ""
Write-Host "[..] 验证 ..." -ForegroundColor Cyan
Start-Sleep -Seconds 6
try {
    $v = Invoke-WebRequest -Uri "https://registry.npmjs.org/$($pkg.name)" -TimeoutSec 20 -UseBasicParsing
    $j = $v.Content | ConvertFrom-Json
    Write-Host "[OK] 发布成功！" -ForegroundColor Green
    Write-Host "     latest = $($j.'dist-tags'.latest)"
    $pageLine = "     页面   = https://www.npmjs.com/package/" + $pkg.name
    Write-Host $pageLine
} catch {
    Write-Host "[!] 已执行发布，验证查询失败（索引可能延迟几分钟）" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== 完成 ===" -ForegroundColor Cyan
Write-Host "安装: dsh plugin --profile desktop add $($pkg.name)"
