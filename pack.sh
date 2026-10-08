#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> [1/2] 清理系统元数据缓存 (.DS_Store)..."
find . -name '.DS_Store' -delete 2>/dev/null || true

echo "==> [2/2] 打包发布压缩包 (排除 .git, _tools, node_modules, .DS_Store)..."
START_TIME=$(date +%s)

zip -r -q pptx.zip . \
  -x "./.git/*" \
  -x ".git/*" \
  -x "./_tools/*" \
  -x "_tools/*" \
  -x "*/node_modules/*" \
  -x "*node_modules*" \
  -x "*.DS_Store*" \
  -x "./pptx.zip" \
  -x "pptx.zip"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
SIZE=$(ls -lh pptx.zip | awk '{print $5}')

echo "✅ 打包完成: pptx.zip (体积: $SIZE, 耗时: ${DURATION}s)"

