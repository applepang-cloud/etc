@echo off
chcp 65001 >nul
title Piano Bricks - Codex
node "%~dp0codex-bridge.mjs"
pause
