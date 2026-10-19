@echo off
setlocal
title Nexus FileHub - Install
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found.
    echo Install the LTS version from https://nodejs.org/ and run this file again.
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo npm was not found. Reinstall Node.js LTS and make sure npm is included.
    echo.
    pause
    exit /b 1
)

echo Installing Nexus FileHub dependencies...
npm install
if errorlevel 1 (
    echo.
    echo Installation failed. Check your internet connection and try again.
    pause
    exit /b 1
)

echo.
echo Installation complete. Double-click start.bat to run Nexus FileHub.
pause
exit /b 0
