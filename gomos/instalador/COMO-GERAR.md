# Como gerar o Gomos-Setup.exe (instalador completo, 1 arquivo)

Monta um Python 3.12 próprio + bibliotecas + ffmpeg e empacota com NSIS (64 bits, sem admin).

1. Python 3.12.10 oficial (NuGet `python` 3.12.10, pasta `tools/`) → `rt/python/`
2. tkinter (não vem no NuGet): `DLLs/_tkinter.pyd` + `Lib/tkinter` do conda-forge `python-3.12`,
   `tcl86t.dll`, `tk86t.dll`, `zlib1.dll` e `tcl8.6`, `tk8.6`, `tcl8` do conda-forge `tk-8.6.13` → `rt/python/DLLs` e `rt/python/tcl/`
3. Bibliotecas: `pip download --platform win_amd64 --python-version 3.12 --only-binary=:all: pillow pillow-heif pymupdf imageio-ffmpeg openpyxl xlrd python-docx pdf2docx mammoth docx2pdf` + `pywin32 colorama`
   → extrair cada .whl em `rt/python/Lib/site-packages` e **reorganizar as pastas `*.data`** (purelib/platlib → site-packages), senão as DLLs do HEIC não carregam.
4. Copiar `gomos.pyw`, `conversores.py`, `gomos.ico`, `baixar-wordcraft.ps1`, `LEIA-ME.md`, `testes/` para `rt/`
5. `makensis gomos.nsi` → `Gomos-Setup.exe`

Testado no Wine 9 (instalar /S, registro, anel, conversão HEIC→JPG, desinstalar). Limitações só do Wine:
numpy (`crealf`) e `CopyFile2` não existem nele — no Windows 10/11 existem.
