@echo off
cd /d "%~dp0"
npm run build:root-exe
if %errorlevel% neq 0 (
  echo 打包失败，跳过复制。
  pause
  exit /b %errorlevel%
)
echo 正在复制 claude-gui-latest.exe 到 D:\git2\python_file\python_file\claude-gui\ ...
copy /y "%~dp0claude-gui-latest.exe" "D:\git2\python_file\python_file\claude-gui\"
if %errorlevel% neq 0 (
  echo 复制失败，请检查目标目录是否存在。
) else (
  echo 复制成功。
)
pause
