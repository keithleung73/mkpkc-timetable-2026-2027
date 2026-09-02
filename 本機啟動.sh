#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "請先安裝 Node.js 20 或以上： https://nodejs.org"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "第一次啟動，正在安裝套件…"
  npm install
fi

echo
echo "瀏覽器請打開  http://127.0.0.1:43217"
echo "代堂頁         http://127.0.0.1:43217/cover"
echo "按 Ctrl+C 可停止網站。"
echo

if command -v xdg-open >/dev/null 2>&1; then
  (sleep 2 && xdg-open "http://127.0.0.1:43217") >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  (sleep 2 && open "http://127.0.0.1:43217") >/dev/null 2>&1 &
fi

npm run dev
