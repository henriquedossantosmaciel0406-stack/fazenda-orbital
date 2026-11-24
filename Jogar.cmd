@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Instale o Node.js 18 ou superior e abra este arquivo novamente.
  pause
  exit /b 1
)
node server.cjs
pause
