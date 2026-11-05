@echo off
title Rabisco
cd /d "%~dp0"
python rabisco.py
if errorlevel 1 py rabisco.py
pause
