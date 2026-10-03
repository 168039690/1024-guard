#!/usr/bin/env bash
# 首次：gh auth login（浏览器点一下）
# 之后：./scripts/deploy-github.sh
set -euo pipefail
cd "$(dirname "$0")/.."

GH="${GH_BIN:-gh}"
if ! command -v "$GH" >/dev/null 2>&1; then
  echo "未找到 gh。安装：https://cli.github.com/ 或 export GH_BIN=/path/to/gh"
  exit 1
fi

"$GH" auth status >/dev/null

REPO_NAME="${1:-1024-guard}"
VIS="${GITHUB_VISIBILITY:-public}"

USER="$("$GH" api user -q .login)"

if ! git remote get-url origin >/dev/null 2>&1; then
  if [[ "$VIS" == "private" ]]; then
    "$GH" repo create "$REPO_NAME" --private --source=. --remote=origin --push
  else
    "$GH" repo create "$REPO_NAME" --public --source=. --remote=origin --push
  fi
else
  git push -u origin main
fi

"$GH" api -X POST "repos/$USER/$REPO_NAME/pages" -f build_type=workflow 2>/dev/null || true

echo ""
echo "仓库：https://github.com/$USER/$REPO_NAME"
echo "Actions：https://github.com/$USER/$REPO_NAME/actions"
echo "若 Pages 未自动启用：Settings → Pages → Source 选 GitHub Actions"
echo "部署成功后访问：https://$USER.github.io/$REPO_NAME/#gate"
