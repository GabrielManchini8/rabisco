@echo off
chcp 65001 >nul
title Instalar Gomos
setlocal EnableDelayedExpansion
set "DEST=%LOCALAPPDATA%\Gomos"

echo.
echo   Gomos - conversor do botao direito
echo   ----------------------------------
echo.

REM 1) acha o Python (py launcher ou python)
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY ( where python >nul 2>nul && set "PY=python" )
if not defined PY (
  echo   Python nao encontrado. Instale em https://www.python.org/downloads/
  echo   ^(marque "Add python.exe to PATH" na instalacao^) e rode de novo.
  pause & exit /b 1
)
for /f "usebackq delims=" %%i in (`%PY% -c "import sys,os;print(os.path.join(os.path.dirname(sys.executable),'pythonw.exe'))"`) do set "PYW=%%i"
if not exist "%PYW%" ( echo   pythonw.exe nao encontrado em "%PYW%". & pause & exit /b 1 )
echo   Python: %PYW%

REM 2) bibliotecas de conversao (inclui o ffmpeg)
echo   Instalando bibliotecas ^(1a vez demora alguns minutos^)...
%PY% -m pip install --user --upgrade --disable-pip-version-check -q -r "%~dp0requirements.txt"
if errorlevel 1 ( echo   Falha ao instalar as bibliotecas. & pause & exit /b 1 )
%PY% -c "import imageio_ffmpeg; imageio_ffmpeg.get_ffmpeg_exe()" >nul 2>nul

REM 3) copia o programa
if not exist "%DEST%" mkdir "%DEST%"
copy /y "%~dp0gomos.pyw" "%DEST%\" >nul
copy /y "%~dp0conversores.py" "%DEST%\" >nul
copy /y "%~dp0gomos.ico" "%DEST%\" >nul
copy /y "%~dp0desinstalar.bat" "%DEST%\" >nul

REM 4) item "Converter" no botao direito de QUALQUER arquivo (so para o seu usuario, sem admin)
set "K=HKCU\Software\Classes\*\shell\Gomos"
reg add "%K%" /ve /d "Converter" /f >nul
reg add "%K%" /v "Icon" /d "%DEST%\gomos.ico" /f >nul
reg add "%K%" /v "MultiSelectModel" /d "Player" /f >nul
reg add "%K%\command" /ve /d "\"%PYW%\" \"%DEST%\gomos.pyw\" \"%%1\"" /f >nul
if errorlevel 1 ( echo   Falha ao registrar o menu. & pause & exit /b 1 )

echo.
echo   Pronto!
echo   Clique com o botao direito em qualquer arquivo ^> "Converter".
echo   No Windows 11: fica em "Mostrar mais opcoes" ^(ou Shift + F10^).
echo   Para o "Converter" aparecer direto no menu do Windows 11, rode menu-classico.bat
echo.
pause
