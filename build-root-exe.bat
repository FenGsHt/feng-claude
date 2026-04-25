@echo off
cd /d "%~dp0"
npm run build:root-exe
if %errorlevel% neq 0 (
  echo 打包失败。
  pause
  exit /b %errorlevel%
)
echo 打包完成。
pause
