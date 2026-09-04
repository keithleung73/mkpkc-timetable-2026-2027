@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "NODE_EXE="
where node >nul 2>nul
if not errorlevel 1 (
  for /f "delims=" %%I in ('where node') do (
    set "NODE_EXE=%%I"
    goto :have_node
  )
)
if exist "%LOCALAPPDATA%\Programs\cursor\resources\app\resources\helpers\node.exe" (
  set "NODE_EXE=%LOCALAPPDATA%\Programs\cursor\resources\app\resources\helpers\node.exe"
  goto :have_node
)
if exist "%LOCALAPPDATA%\Programs\Cursor\resources\app\resources\helpers\node.exe" (
  set "NODE_EXE=%LOCALAPPDATA%\Programs\Cursor\resources\app\resources\helpers\node.exe"
  goto :have_node
)

echo 搵唔到 Node.js。請先開 Cursor，或者安裝 Node.js 20+。
pause
exit /b 1

:have_node
if not exist "node_modules\next\dist\bin\next" (
  echo 未有 node_modules，唔能夠啟動。請完整 copy 成個資料夾。
  pause
  exit /b 1
)

echo.
echo ========================================
echo   萬鈞伯裘書院課表 — 校內共用模式
echo ========================================
echo.
echo 呢部電腦會做主機，請保持呢個視窗開住。
echo 同一校網嘅同事可用瀏覽器打開以下網址：
echo.

set "SHARE_URL="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=*" %%b in ("%%a") do (
    echo   http://%%b:43217
    echo   代堂： http://%%b:43217/cover
    echo   給同事： http://%%b:43217/share
    if not defined SHARE_URL set "SHARE_URL=http://%%b:43217"
  )
)

if not defined SHARE_URL set "SHARE_URL=http://127.0.0.1:43217"

echo.
echo 如果同事開唔到，請右鍵「以系統管理員身分執行」：
echo   開啟校內共用防火牆.bat
echo.
echo 關閉呢個視窗即停止共用。
echo ========================================
echo.

start "" "%SHARE_URL%"
"%NODE_EXE%" ".\node_modules\next\dist\bin\next" dev --webpack --hostname 0.0.0.0 --port 43217
pause
