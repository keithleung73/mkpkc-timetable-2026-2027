#!/bin/bash
cd "$(dirname "$0")"
chmod +x "./本機啟動.sh" 2>/dev/null || true
exec "./本機啟動.sh"
