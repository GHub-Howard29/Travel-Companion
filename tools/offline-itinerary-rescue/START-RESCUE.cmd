@echo off
chcp 65001 >nul
setlocal
title Travel Companion Offline Itinerary Rescue
"%~dp0node.exe" "%~dp0offline-itinerary-rescue.mjs"
echo.
pause
