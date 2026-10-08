#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

COMMIT_MSG="${1:-}"
if [ -z "$COMMIT_MSG" ]; then
  COMMIT_MSG="chore: update presentations and assets ($(date '+%Y-%m-%d %H:%M'))"
fi

echo "=========================================="
echo "🚀 步骤 1: 打包发布文件 (pptx.zip)"
echo "=========================================="
./pack.sh

echo ""
echo "=========================================="
echo "🚀 步骤 2: 提交代码到 GitHub"
echo "=========================================="

# 添加所有修改（已通过 .gitignore 排除 _tools, node_modules, pptx.zip 等）
git add -A

if git diff --staged --quiet; then
  echo "ℹ️  暂存区无新增修改，无需 commit。"
else
  git commit -m "$COMMIT_MSG"
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "正在推送到 origin $BRANCH ..."
git push origin "$BRANCH"

echo ""
echo "🎉 发布与提交 GitHub 完成！"

