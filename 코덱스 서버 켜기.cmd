@echo off
chcp 65001 >nul
rem 피아노 블록: 레벨 만들기용 코덱스 브리지 서버. 이 창을 닫으면 꺼집니다.
cd /d "%~dp0"
node piano-block-puzzle/tools/codex-bridge.mjs
pause
