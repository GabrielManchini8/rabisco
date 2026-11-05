@echo off
chcp 65001 >nul
title Instalador do Rabisco
setlocal
set "DEST=%USERPROFILE%\Rabisco"

echo.
echo  === Rabisco - instalacao ===
echo.

REM 1) Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js nao encontrado. Instalando pelo winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo.
    echo  Nao consegui instalar o Node.js automaticamente.
    echo  Baixe e instale manualmente: https://nodejs.org  ^(versao LTS^)
    echo  Depois rode este instalador de novo.
    pause & exit /b 1
  )
  REM recarrega o PATH desta janela
  set "PATH=%PATH%;%ProgramFiles%\nodejs"
)

REM 2) Baixa o codigo do GitHub
echo  Baixando o Rabisco...
powershell -NoProfile -Command "Invoke-WebRequest 'https://github.com/GabrielManchini8/rabisco/archive/refs/heads/main.zip' -OutFile \"$env:TEMP\rabisco.zip\"; if (Test-Path '%DEST%') { Remove-Item '%DEST%\app\src' -Recurse -Force -ErrorAction SilentlyContinue }; Expand-Archive \"$env:TEMP\rabisco.zip\" \"$env:TEMP\rabisco-x\" -Force; New-Item -ItemType Directory -Force '%DEST%' | Out-Null; Copy-Item \"$env:TEMP\rabisco-x\rabisco-main\*\" '%DEST%' -Recurse -Force; Remove-Item \"$env:TEMP\rabisco-x\" -Recurse -Force"
if errorlevel 1 ( echo  Falha ao baixar. Verifique a internet. & pause & exit /b 1 )

REM 3) Dependencias
echo  Instalando dependencias ^(alguns minutos na primeira vez^)...
cd /d "%DEST%\app"
call npm install --no-audit --no-fund
if errorlevel 1 ( echo  Falha no npm install. & pause & exit /b 1 )

REM 4) Atalho "Rabisco" na area de trabalho
> "%DEST%\abrir-rabisco.bat" (
  echo @echo off
  echo title Rabisco
  echo cd /d "%DEST%\app"
  echo call npm run dev -- --port 5173 --open
)
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Rabisco.lnk'); $s.TargetPath='%DEST%\abrir-rabisco.bat'; $s.WorkingDirectory='%DEST%\app'; $s.WindowStyle=7; $s.Save()"

echo.
echo  Pronto! Abrindo o Rabisco...
echo  Da proxima vez, use o atalho "Rabisco" na area de trabalho.
echo  ^(deixe a janela preta aberta enquanto usa o app^)
echo.
call "%DEST%\abrir-rabisco.bat"
