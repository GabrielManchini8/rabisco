# 🍊 Gomos — conversor do botão direito (Windows)

Clique com o **botão direito** em qualquer arquivo → **Converter** → os gomos abrem em volta do mouse.
Escolha o formato e o arquivo novo aparece **ao lado do original** (nunca sobrescreve), já selecionado no Explorer.

## Instalar
1. Tenha o **Python** instalado (python.org, marcando "Add python.exe to PATH").
2. Dê dois cliques em **instalar.bat**.
3. Windows 11: o item fica em *Mostrar mais opções*. Para aparecer direto, rode **menu-classico.bat**.

Para remover: **desinstalar.bat**.

## O que converte (tudo local, sem internet)
| Arquivo | Gomos |
|---|---|
| Fotos: JPG, PNG, WEBP, **HEIC**, TIFF, BMP, **AVIF**, GIF, ICO, PSD… | JPG, PNG, WEBP, HEIC, TIFF, BMP, AVIF, GIF, ICO, PDF, Reduzir 50%, Sem metadados (remove GPS/câmera) |
| Áudio: MP3, WAV, M4A, AAC, OGG, OPUS, FLAC, **WMA**, AMR, AIFF… | MP3, WAV, M4A, OGG, OPUS, FLAC |
| Vídeo: MP4, MOV, **AVI**, MKV, WMV, FLV, 3GP, WEBM, MPEG… | MP4, MP4 leve (WhatsApp), WEBM, MOV, AVI, MKV, GIF, Áudio MP3/WAV, 1º quadro |
| PDF | **Remover senha** (se tiver), **Word (DOCX)** editável, Páginas PNG/JPG, Texto, Comprimir, Dividir, Girar 90° |
| Excel (XLSX, XLS), CSV | CSV, XLSX, JSON, HTML |
| Word (DOCX, DOC, ODT, RTF) | **PDF**, DOCX, ODT, RTF, HTML, Markdown, TXT, Imagem PNG, **PDF com revisões** (comentários e alterações controladas) |
| Texto/Markdown | PDF, **Word (DOCX)**, ODT, HTML |

Selecionou **vários arquivos do mesmo tipo**? Um único anel converte todos de uma vez.

### Word → PDF
Usa o melhor que o computador tiver: **Microsoft Word** (idêntico) → **WordCraft** (baixado pelo instalador; fiel e rápido) → **LibreOffice** (grátis, quase idêntico) → conversor próprio (sem nada instalado; mantém títulos, negrito, listas, tabelas e imagens). DOC/ODT/RTF precisam do Word ou do LibreOffice.

### PDF → Word
Gera um DOCX editável mantendo parágrafos, tabelas e imagens. PDF escaneado (foto de papel) vira Word com imagem — para texto editável precisaria de OCR.

### PDF com senha
O Gomos pede a senha na hora e oferece o gomo **Remover senha** (gera uma cópia sem proteção).

## Créditos
- [WordCraft](https://github.com/storytold/wordcraft) (MIT/Apache-2.0) — conversão de documentos Word/ODT/RTF/Markdown, baixado pelo instalador.
- Testado com os acervos [py-pdf/sample-files](https://github.com/py-pdf/sample-files) (38 PDFs: senha, formulários, árabe, imagens, escaneados) e [felixlimanta/sample-docx-repo](https://github.com/felixlimanta/sample-docx-repo). Para repetir: `python testes/testar_pasta.py <pasta>`.
