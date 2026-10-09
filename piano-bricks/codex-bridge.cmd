@echo off
chcp 65001 >nul
title Piano Bricks - http://localhost:8788
rem Opens the game in the browser once the server is up (2 s), then runs the server in this window.
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:8788"
node "%~dp0codex-bridge.mjs"
pause
