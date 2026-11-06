; Gomos — instalador completo (Python próprio + bibliotecas + ffmpeg + programa). Não precisa de administrador.
Unicode true
Target amd64-unicode
!include "MUI2.nsh"
!include "LogicLib.nsh"
Name "Gomos"
OutFile "Gomos-Setup.exe"
InstallDir "$LOCALAPPDATA\Gomos"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
BrandingText "Gomos — conversor do botão direito"
!define MUI_ICON "rt\gomos.ico"
!define MUI_UNICON "rt\gomos.ico"
!define MUI_WELCOMEPAGE_TITLE "Instalar o Gomos"
!define MUI_WELCOMEPAGE_TEXT "Depois de instalar, clique com o botão direito em qualquer arquivo e escolha$\r$\n$\"Converter$\": os gomos aparecem em volta do mouse.$\r$\n$\r$\nJá vem tudo incluído (Python, bibliotecas e ffmpeg). Não altera o Python que você já tem."
!define MUI_FINISHPAGE_TEXT "Pronto! Clique com o botão direito em qualquer arquivo > Converter.$\r$\n$\r$\nNo Windows 11 o item fica em $\"Mostrar mais opções$\" (ou Shift+F10)."
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\LEIA-ME.md"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Abrir o LEIA-ME"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

Section "Gomos (obrigatório)" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\python"            ; atualização limpa
  File /r "rt\python"
  File "rt\gomos.pyw" "rt\conversores.py" "rt\gomos.ico" "rt\baixar-wordcraft.ps1" "rt\LEIA-ME.md"
  SetOutPath "$INSTDIR\testes"
  File "rt\testes\*.py"
  SetOutPath "$INSTDIR"
  ; item "Converter" no botão direito de qualquer arquivo
  WriteRegStr HKCU "Software\Classes\*\shell\Gomos" "" "Converter"
  WriteRegStr HKCU "Software\Classes\*\shell\Gomos" "Icon" "$INSTDIR\gomos.ico"
  WriteRegStr HKCU "Software\Classes\*\shell\Gomos" "MultiSelectModel" "Player"
  WriteRegStr HKCU "Software\Classes\*\shell\Gomos\command" "" '"$INSTDIR\python\pythonw.exe" "$INSTDIR\gomos.pyw" "%1"'
  ; aparece em Configurações > Aplicativos instalados
  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  !define UK "Software\Microsoft\Windows\CurrentVersion\Uninstall\Gomos"
  WriteRegStr HKCU "${UK}" "DisplayName" "Gomos — conversor de arquivos"
  WriteRegStr HKCU "${UK}" "DisplayIcon" "$INSTDIR\gomos.ico"
  WriteRegStr HKCU "${UK}" "Publisher" "Rabisco"
  WriteRegStr HKCU "${UK}" "DisplayVersion" "1.0"
  WriteRegStr HKCU "${UK}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
  WriteRegDWORD HKCU "${UK}" "NoModify" 1
  WriteRegDWORD HKCU "${UK}" "NoRepair" 1
SectionEnd

Section "WordCraft — Word/ODT/RTF sem precisar do Word (baixa ~50 MB)" SecWordCraft
  DetailPrint "Baixando o WordCraft..."
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\baixar-wordcraft.ps1" -Destino "$INSTDIR\wordcraft"'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Não foi possível baixar o WordCraft agora (sem internet?). O Gomos funciona sem ele."
  ${EndIf}
SectionEnd

Section /o "Menu completo do Windows 11 (Converter direto, sem 'Mostrar mais opções')" SecClassic
  WriteRegStr HKCU "Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32" "" ""
  DetailPrint "Menu clássico ativado (vale após reiniciar o Explorer ou o computador)."
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} "O programa, o Python próprio, as bibliotecas e o ffmpeg."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecWordCraft} "Converte DOCX/DOC/ODT/RTF/Markdown com fidelidade, sem Word nem LibreOffice. Precisa de internet na instalação."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecClassic} "Volta o menu do botão direito do Windows 10, onde o Converter aparece direto."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "Uninstall"
  DeleteRegKey HKCU "Software\Classes\*\shell\Gomos"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Gomos"
  RMDir /r "$INSTDIR"
SectionEnd
