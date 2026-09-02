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

REM 本機未安裝 Node 時，改用 Cursor 內建 Node（唔使上網下載）
if exist "%LOCALAPPDATA%\Programs\cursor\resources\app\resources\helpers\node.exe" (
  set "NODE_EXE=%LOCALAPPDATA%\Programs\cursor\resources\app\resources\helpers\node.exe"
  goto :have_node
)
if exist "%LOCALAPPDATA%\Programs\Cursor\resources\app\resources\helpers\node.exe" (
  set "NODE_EXE=%LOCALAPPDATA%\Programs\Cursor\resources\app\resources\helpers\node.exe"
  goto :have_node
)

echo 搵唔到 Node.js。
echo 1^) 安裝 Node.js 20+： https://nodejs.org
echo 2^) 或者先開 Cursor，再雙擊呢個檔（會用 Cursor 內建 Node）。
pause
exit /b 1

:have_node
echo 使用 Node：%NODE_EXE%
"%NODE_EXE%" -v

if not exist "node_modules\next\dist\bin\next" (
  where npm >nul 2>nul
  if errorlevel 1 (
    echo 未有 node_modules，而且本機冇 npm，唔能夠自動安裝套件。
    echo 請喺有網絡嘅電腦跑一次 npm install，或者完整 copy 成個資料夾（包埋 node_modules）。
    pause
    exit /b 1
  )
  echo 第一次啟動，正在安裝套件...
  call npm install
  if errorlevel 1 (
    echo 安裝失敗。請檢查網絡後再試。
    pause
    exit /b 1
  )
)

echo.
echo 瀏覽器請打開  http://127.0.0.1:43217
echo 代堂頁         http://127.0.0.1:43217/cover
echo 關閉呢個視窗即停止網站。
echo.
start "" http://127.0.0.1:43217
REM 學校網絡碟（S: / UNC）用 Turbopack 會報 path outside root，改用 webpack
"%NODE_EXE%" ".\node_modules\next\dist\bin\next" dev --webpack --hostname 127.0.0.1 --port 43217
pause
