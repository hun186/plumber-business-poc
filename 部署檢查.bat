@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [E_NODE] 請先到 https://nodejs.org/en/download 安裝 Node.js LTS。
  pause
  exit /b 1
)
node "%~dp0tools\owner-cli.js" check
pause
