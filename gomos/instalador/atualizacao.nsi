; Gomos — ATUALIZAÇÃO 1.1 (só o que mudou desde o instalador 1.0: programa + OCR). Um clique.
Unicode true
Target amd64-unicode
!include "MUI2.nsh"
Name "Gomos — atualização 1.1"
OutFile "Gomos-Atualizacao-1.1.exe"
InstallDir "$LOCALAPPDATA\Gomos"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show
BrandingText "Gomos — atualização 1.1"
!define MUI_ICON "rt\gomos.ico"
!define MUI_FINISHPAGE_TEXT "Gomos atualizado para a versão 1.1.$\r$\n$\r$\nNovidade: botão direito numa imagem, print ou PDF escaneado > Converter > Excel (XLSX) — cada valor vai para a sua célula."
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "PortugueseBR"

Function .onInit
  ; só atualiza se o Gomos já estiver instalado
  IfFileExists "$LOCALAPPDATA\Gomos\python\pythonw.exe" +3
    MessageBox MB_ICONEXCLAMATION "O Gomos não está instalado neste computador.$\r$\nUse o instalador completo (Gomos-Setup.exe) em vez desta atualização."
    Abort
FunctionEnd

Section "Atualizar"
  SetOutPath "$INSTDIR"
  DetailPrint "Atualizando o programa..."
  File "rt\gomos.pyw" "rt\conversores.py" "rt\ocr.py" "rt\gomos.ico" "rt\baixar-wordcraft.ps1" "rt\LEIA-ME.md"
  SetOutPath "$INSTDIR\testes"
  File "rt\testes\*.py"
  DetailPrint "Instalando a leitura de imagens (OCR em português)..."
  RMDir /r "$INSTDIR\tesseract"
  SetOutPath "$INSTDIR"
  File /r "rt\tesseract"
  ; limpa cache antigo do Python e registra a versão nova
  RMDir /r "$INSTDIR\__pycache__"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Gomos" "DisplayVersion" "1.1"
  DetailPrint "Pronto."
SectionEnd
