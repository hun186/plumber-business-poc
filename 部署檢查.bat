@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if errorlevel 1 (
  echo [E_PATH] Cannot open the application folder.
  pause
  exit /b 1
)
where node.exe >nul 2>nul
if errorlevel 1 (
  echo [E_NODE] Node.js LTS is required. Visit https://nodejs.org/en/download
  pause
  exit /b 1
)
node "%~dp0tools\owner-cli.js" check
if errorlevel 1 (
  echo [E_CHECK] Command failed. See details above.
  pause
  exit /b 1
)
echo [OK] CHECK completed.
pause
endlocal
