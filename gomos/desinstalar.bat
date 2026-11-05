@echo off
chcp 65001 >nul
reg delete "HKCU\Software\Classes\*\shell\Gomos" /f >nul 2>nul
rmdir /s /q "%LOCALAPPDATA%\Gomos" 2>nul
echo   Gomos removido do menu do botao direito.
pause
