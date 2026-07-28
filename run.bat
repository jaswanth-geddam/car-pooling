@echo off
cd /d "%~dp0"

echo === Installing ===
call pnpm install

echo.
echo === Formatting ===
call pnpm run format 2>nul
if %ERRORLEVEL% NEQ 0 echo No format script

echo === Linting ===
call pnpm run lint 2>nul
if %ERRORLEVEL% NEQ 0 echo No lint script

echo.
echo === Starting ===
call pnpm run start:dev

pause
