@echo off
cd /d "%~dp0"

echo === Installing ===
call npm install

echo.
echo === Formatting ===
call npm run format 2>nul
if %ERRORLEVEL% NEQ 0 echo No format script

echo === Linting ===
call npm run lint 2>nul
if %ERRORLEVEL% NEQ 0 echo No lint script

echo.
echo === Starting ===
call npm run start:dev

pause
