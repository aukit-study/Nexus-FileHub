@echo off
setlocal
title Nexus FileHub
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found. Install Node.js LTS from https://nodejs.org/ first.
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

if not exist "node_modules\express" goto install_dependencies
if not exist "node_modules\qrcode" goto install_dependencies
goto dependencies_ready

:install_dependencies
echo Dependencies are missing or outdated. Installing them now...
call npm install
if errorlevel 1 (
    echo.
    echo Installation failed. Check your internet connection and try again.
    pause
    exit /b 1
)

:dependencies_ready

echo Starting Nexus FileHub...
echo Open http://localhost:3000 in your browser.
echo Keep this window open while using the file manager. Press Ctrl+C to stop.
echo.
npm start
if errorlevel 1 (
    echo.
    echo The server stopped because an error occurred.
    pause
)
endlocal
