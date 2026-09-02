@echo off
chcp 65001 >nul
net session >nul 2>&1
if errorlevel 1 (
  echo 需要系統管理員權限以開啟防火牆...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

netsh advfirewall firewall delete rule name="MKPKC Timetable 43217" >nul 2>&1
netsh advfirewall firewall add rule name="MKPKC Timetable 43217" dir=in action=allow protocol=TCP localport=43217 profile=any
if errorlevel 1 (
  echo 開防火牆失敗。
  pause
  exit /b 1
)

echo 已允許 TCP 43217。同事可於校內用瀏覽器開啟：
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo   http://%%a:43217
echo.
pause
