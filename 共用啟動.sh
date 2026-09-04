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

PORT=43217
echo
echo "========================================"
echo "  萬鈞伯裘書院課表 — 校內共用"
echo "========================================"
echo "請保持呢個視窗開住。同事用瀏覽器打開："
echo

if command -v ip >/dev/null 2>&1; then
  ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1 | while read -r ip; do
    echo "  http://${ip}:${PORT}"
    echo "  代堂  http://${ip}:${PORT}/cover"
    echo "  給同事  http://${ip}:${PORT}/share"
  done
elif command -v ifconfig >/dev/null 2>&1; then
  ifconfig | awk '/inet / && $2 != "127.0.0.1" {print $2}' | while read -r ip; do
    echo "  http://${ip}:${PORT}"
  done
fi

echo
echo "本機： http://127.0.0.1:${PORT}"
echo "按 Ctrl+C 停止共用。"
echo "========================================"
echo

if command -v xdg-open >/dev/null 2>&1; then
  (sleep 2 && xdg-open "http://127.0.0.1:${PORT}/share") >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  (sleep 2 && open "http://127.0.0.1:${PORT}/share") >/dev/null 2>&1 &
fi

npm run dev
