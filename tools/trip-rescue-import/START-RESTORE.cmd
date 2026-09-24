@echo off
chcp 65001 >nul
setlocal
title Travel Companion Rescue Restore
cd /d "%~dp0..\.."
echo Travel Companion controlled rescue restore
echo.
echo Follow the prompts. Preview runs first; no data is written until confirmed.
echo.
node tools\trip-rescue-import\restore-trip.mjs
echo.
pause
