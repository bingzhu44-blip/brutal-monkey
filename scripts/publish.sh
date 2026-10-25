#!/usr/bin/env bash
# 一键发布 dsh-brutal-delete 到 npm
# 用法：
#   NPM_TOKEN=npm_xxxxxxxx bash publish.sh
#   或先执行 npm login，再直接 bash publish.sh
set -euo pipefail

cd "$(dirname "$0")"

PKG=$(node -p "require('./package.json').name")
VER=$(node -p "require('./package.json').version")
echo "==> 发布 $PKG@$VER"

# 1. 校验
node --check lib/index.js
node --check lib/client.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'));JSON.parse(require('fs').readFileSync('dsh.plugin.json','utf8'));console.log('json ok')"

# 版本一致性
MAN_VER=$(node -p "require('./dsh.plugin.json').version")
if [ "$VER" != "$MAN_VER" ]; then
  echo "!! 版本不一致: package.json=$VER dsh.plugin.json=$MAN_VER" >&2
  exit 1
fi

# 2. 检查包名是否已被占用
if npm view "$PKG" version >/dev/null 2>&1; then
  echo "!! npm 上已存在 $PKG，请先改版本号或包名" >&2
  exit 1
fi
echo "==> 包名可用"

# 3. 认证
if [ -n "${NPM_TOKEN:-}" ]; then
  TMPRC=$(mktemp)
  printf '//registry.npmjs.org/:_authToken=%s\n' "$NPM_TOKEN" > "$TMPRC"
  trap 'rm -f "$TMPRC"' EXIT
  echo "==> 使用 NPM_TOKEN 认证"
  npm publish --userconfig "$TMPRC" --access public
else
  echo "==> 使用本地 npm 登录态"
  npm publish --access public
fi

echo "==> 完成：https://www.npmjs.com/package/$PKG"
echo "==> 安装命令：dsh plugin --profile desktop add $PKG"
