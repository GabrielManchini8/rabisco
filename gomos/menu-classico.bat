@echo off
chcp 65001 >nul
REM Windows 11: volta o menu completo do botao direito (com "Converter" direto, sem "Mostrar mais opcoes").
REM Para desfazer:  reg delete "HKCU\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}" /f  e reinicie o Explorer.
reg add "HKCU\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32" /ve /f >nul
taskkill /f /im explorer.exe >nul & start explorer.exe
echo   Menu classico ativado.
pause
