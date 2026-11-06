"""
Motor de conversão do Gomos — tudo local, sem internet.
Cada tipo de arquivo tem uma lista de "gomos" (ações). Cada ação gera arquivo(s)
novo(s) ao lado do original, sem nunca sobrescrever nada.
"""
from __future__ import annotations
import os, subprocess, json, csv, shutil, tempfile, io, sys
from pathlib import Path
from typing import Callable
sys.path.insert(0, str(Path(__file__).resolve().parent))  # para achar ocr.py

# ---------------------------------------------------------------- utilidades
def livre(p: Path) -> Path:
    """foto.jpg → foto (1).jpg se já existir (nunca sobrescreve)."""
    if not p.exists():
        return p
    i = 1
    while True:
        q = p.with_name(f"{p.stem} ({i}){p.suffix}")
        if not q.exists():
            return q
        i += 1

def saida(src: Path, ext: str, sufixo: str = "") -> Path:
    return livre(src.with_name(src.stem + sufixo + "." + ext))

def ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return shutil.which("ffmpeg") or "ffmpeg"

def ffmpeg(src: Path, dst: Path, args: list[str]) -> Path:
    flags = 0x08000000 if os.name == "nt" else 0  # CREATE_NO_WINDOW: sem janela preta piscando
    r = subprocess.run([ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), *args, str(dst)],
                       capture_output=True, text=True, creationflags=flags)
    if r.returncode != 0:
        dst.unlink(missing_ok=True)
        raise RuntimeError(r.stderr.strip().splitlines()[-1] if r.stderr.strip() else "ffmpeg falhou")
    return dst

# ---------------------------------------------------------------- avisos e senha
AVISOS: list[str] = []          # avisos não fatais (o arquivo foi gerado, mas…); a interface mostra no fim
PEDIR_SENHA = None              # a interface troca por uma função (nome_do_arquivo) -> senha | None
_SENHAS: dict[str, str] = {}

# ---------------------------------------------------------------- tipos
IMG = {"jpg", "jpeg", "jfif", "png", "webp", "heic", "heif", "tif", "tiff", "bmp", "gif", "avif", "ico", "psd", "tga", "dds", "pcx", "jp2"}
AUD = {"mp3", "wav", "m4a", "aac", "ogg", "oga", "opus", "flac", "wma", "amr", "aiff", "aif", "caf", "ac3"}
VID = {"mp4", "m4v", "mov", "avi", "mkv", "wmv", "flv", "3gp", "webm", "mpeg", "mpg", "ts", "mts", "m2ts", "vob", "ogv"}
PDF = {"pdf"}
XLS = {"xlsx", "xlsm", "xls", "ods"}
CSV = {"csv", "tsv"}
DOC = {"docx", "doc", "odt", "rtf"}
TXT = {"txt", "md", "markdown", "json", "log"}
HTM = {"html", "htm"}

def tipo(p: Path) -> str:
    e = p.suffix.lower().lstrip(".")
    for nome, grupo in (("imagem", IMG), ("audio", AUD), ("video", VID), ("pdf", PDF), ("planilha", XLS), ("csv", CSV), ("word", DOC), ("texto", TXT)):
        if e in grupo:
            return nome
    return "outro"

# ---------------------------------------------------------------- imagens
def _abrir_imagem(src: Path):
    from PIL import Image
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()  # HEIC/HEIF (iPhone)
    except Exception:
        pass
    im = Image.open(src)
    try:
        from PIL import ImageOps
        im = ImageOps.exif_transpose(im)  # respeita a rotação da câmera
    except Exception:
        pass
    return im

def img_para(fmt: str, escala: float = 1.0, sufixo: str = "", limpar: bool = False) -> Callable[[Path], list[Path]]:
    def run(src: Path) -> list[Path]:
        from PIL import Image
        im = _abrir_imagem(src)
        if escala != 1.0:
            im = im.resize((max(1, int(im.width * escala)), max(1, int(im.height * escala))), Image.LANCZOS)
        ext = fmt
        if fmt == "mesmo":
            ext = "png" if src.suffix.lower() in (".png", ".gif") else "jpg"
        sem_alpha = ext in ("jpg", "jpeg", "bmp", "pdf")
        if sem_alpha and im.mode not in ("RGB", "L"):
            fundo = Image.new("RGB", im.size, "white")
            fundo.paste(im.convert("RGBA"), mask=im.convert("RGBA").split()[-1])
            im = fundo
        dst = saida(src, ext, sufixo)
        kw = {}
        if ext in ("jpg", "jpeg"):
            kw = {"quality": 92, "optimize": True}
        elif ext == "webp":
            kw = {"quality": 88}
        elif ext in ("heic", "avif"):
            kw = {"quality": 85}
            if ext == "heic":
                import pillow_heif
                pillow_heif.register_heif_opener()
        elif ext == "ico":
            kw = {"sizes": [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]}
        if not limpar and ext in ("jpg", "jpeg", "webp", "png") and im.info.get("exif"):
            kw["exif"] = im.info["exif"]  # mantém data/câmera
        # ao "limpar", não passa exif/gps/icc → sai sem metadados
        im.save(dst, **kw)
        return [dst]
    return run

def imgs_para_pdf(src: Path) -> list[Path]:
    return img_para("pdf")(src)

# ---------------------------------------------------------------- áudio / vídeo
AUDIO = {
    "mp3": ["-vn", "-c:a", "libmp3lame", "-q:a", "2"],
    "wav": ["-vn", "-c:a", "pcm_s16le"],
    "m4a": ["-vn", "-c:a", "aac", "-b:a", "192k"],
    "ogg": ["-vn", "-c:a", "libvorbis", "-q:a", "5"],
    "opus": ["-vn", "-c:a", "libopus", "-b:a", "96k"],
    "flac": ["-vn", "-c:a", "flac"],
}
VIDEO = {
    "mp4": ["-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"],
    "mp4-leve": ["-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-vf", "scale=-2:'min(720,ih)'", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart"],
    "webm": ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-row-mt", "1", "-c:a", "libopus"],
    "mkv": ["-c", "copy"],
    "mov": ["-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac"],
    "avi": ["-c:v", "mpeg4", "-q:v", "4", "-c:a", "libmp3lame"],
    "gif": ["-vf", "fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse", "-loop", "0"],
}
def av(chave: str, ext: str | None = None, sufixo: str = "") -> Callable[[Path], list[Path]]:
    receita = AUDIO.get(chave) or VIDEO[chave]
    return lambda src: [ffmpeg(src, saida(src, ext or chave, sufixo), receita)]

def primeiro_quadro(src: Path) -> list[Path]:
    return [ffmpeg(src, saida(src, "jpg", " - quadro"), ["-frames:v", "1", "-q:v", "2"])]

# ---------------------------------------------------------------- PDF
def _pdf():
    import pymupdf
    return pymupdf

def abrir_pdf(src: Path):
    """Abre o PDF; se tiver senha, pede uma vez (e lembra durante esta execução)."""
    pymupdf = _pdf()
    doc = pymupdf.open(src)
    if doc.needs_pass:
        senha = _SENHAS.get(str(src)) or (PEDIR_SENHA(src.name) if PEDIR_SENHA else None)
        if not senha or not doc.authenticate(senha):
            doc.close(); raise RuntimeError("PDF protegido por senha (senha não informada ou incorreta)")
        _SENHAS[str(src)] = senha
    if doc.page_count == 0:
        doc.close(); raise RuntimeError("PDF sem páginas legíveis (arquivo danificado)")
    return doc

def pdf_tem_senha(src: Path) -> bool:
    try:
        with _pdf().open(src) as d:
            return d.needs_pass
    except Exception:
        return False

def pdf_sem_senha(src: Path) -> list[Path]:
    dst = saida(src, "pdf", " - sem senha")
    with abrir_pdf(src) as doc:
        doc.save(dst, encryption=_pdf().PDF_ENCRYPT_NONE)
    return [dst]

def pdf_imagens(ext: str) -> Callable[[Path], list[Path]]:
    def run(src: Path) -> list[Path]:
        pymupdf = _pdf()
        out = []
        with abrir_pdf(src) as doc:
            for i, pg in enumerate(doc, 1):
                pix = pg.get_pixmap(dpi=150)
                dst = saida(src, ext, f" - pág {i}")
                pix.save(dst, jpg_quality=90) if ext == "jpg" else pix.save(dst)
                out.append(dst)
        return out
    return run

def pdf_texto(src: Path) -> list[Path]:
    with abrir_pdf(src) as doc:
        txt = "\n\n".join(f"--- Página {i} ---\n{pg.get_text()}" for i, pg in enumerate(doc, 1))
    dst = saida(src, "txt"); dst.write_text(txt, encoding="utf-8"); return [dst]

def pdf_comprimir(src: Path) -> list[Path]:
    pymupdf = _pdf()
    dst = saida(src, "pdf", " - comprimido")
    with abrir_pdf(src) as doc:
        try:  # reduz imagens internas para 150 dpi
            doc.rewrite_images(dpi_threshold=200, dpi_target=150, quality=75)
        except Exception:
            pass
        doc.save(dst, garbage=4, deflate=True, clean=True)
    return [dst]

def pdf_dividir(src: Path) -> list[Path]:
    pymupdf = _pdf()
    out = []
    with abrir_pdf(src) as doc:
        for i in range(doc.page_count):
            novo = pymupdf.open(); novo.insert_pdf(doc, from_page=i, to_page=i)
            dst = saida(src, "pdf", f" - pág {i + 1}"); novo.save(dst); novo.close(); out.append(dst)
    return out

def pdf_girar(src: Path) -> list[Path]:
    pymupdf = _pdf()
    dst = saida(src, "pdf", " - girado")
    with abrir_pdf(src) as doc:
        for pg in doc:
            pg.set_rotation((pg.rotation + 90) % 360)
        doc.save(dst)
    return [dst]

# ---------------------------------------------------------------- planilhas / texto
def _ler_planilha(src: Path) -> dict[str, list[list]]:
    e = src.suffix.lower()
    if e in (".csv", ".tsv"):
        with open(src, newline="", encoding="utf-8-sig", errors="replace") as f:
            amostra = f.read(4096); f.seek(0)
            try:
                dial = csv.Sniffer().sniff(amostra, delimiters=",;\t|")
            except csv.Error:
                dial = csv.excel_tab if e == ".tsv" else csv.excel
            return {src.stem: list(csv.reader(f, dial))}
    if e == ".xls":
        import xlrd
        wb = xlrd.open_workbook(src)
        return {s.name: [s.row_values(r) for r in range(s.nrows)] for s in wb.sheets()}
    if e == ".ods":
        raise RuntimeError("ODS: abra no LibreOffice e salve como XLSX")
    import openpyxl
    wb = openpyxl.load_workbook(src, data_only=True, read_only=True)
    return {ws.title: [list(r) for r in ws.iter_rows(values_only=True)] for ws in wb.worksheets}

def plan_csv(src: Path) -> list[Path]:
    out = []
    folhas = _ler_planilha(src)
    for nome, linhas in folhas.items():
        dst = saida(src, "csv", "" if len(folhas) == 1 else f" - {nome}")
        with open(dst, "w", newline="", encoding="utf-8-sig") as f:
            csv.writer(f, delimiter=";").writerows([["" if v is None else v for v in r] for r in linhas])  # ; = Excel em português
        out.append(dst)
    return out

def plan_xlsx(src: Path) -> list[Path]:
    import openpyxl
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    for nome, linhas in _ler_planilha(src).items():
        ws = wb.create_sheet(str(nome)[:31])
        for r in linhas:
            ws.append(r)
    dst = saida(src, "xlsx"); wb.save(dst); return [dst]

def plan_json(src: Path) -> list[Path]:
    dados = {}
    for nome, linhas in _ler_planilha(src).items():
        if not linhas:
            continue
        cab = [str(c) if c is not None else f"col{i}" for i, c in enumerate(linhas[0])]
        dados[nome] = [dict(zip(cab, r)) for r in linhas[1:]]
    dst = saida(src, "json"); dst.write_text(json.dumps(dados, ensure_ascii=False, indent=2, default=str), encoding="utf-8"); return [dst]

def plan_html(src: Path) -> list[Path]:
    import html
    partes = []
    for nome, linhas in _ler_planilha(src).items():
        corpo = "".join("<tr>" + "".join(f"<td>{html.escape(str('' if v is None else v))}</td>" for v in r) + "</tr>" for r in linhas)
        partes.append(f"<h2>{html.escape(str(nome))}</h2><table border=1 cellspacing=0 cellpadding=4>{corpo}</table>")
    dst = saida(src, "html"); dst.write_text("<meta charset=utf-8>" + "".join(partes), encoding="utf-8"); return [dst]

def word_texto(ext: str) -> Callable[[Path], list[Path]]:
    def run(src: Path) -> list[Path]:
        import docx
        d = docx.Document(src)
        linhas = []
        for p in d.paragraphs:
            t = p.text
            if ext == "md" and p.style is not None and p.style.name.lower().startswith(("heading", "título")):
                nivel = "".join(ch for ch in p.style.name if ch.isdigit()) or "1"
                t = "#" * int(nivel) + " " + t
            linhas.append(t)
        dst = saida(src, ext); dst.write_text("\n".join(linhas), encoding="utf-8"); return [dst]
    return run

# ---------------------------------------------------------------- Word <-> PDF
def _soffice() -> str | None:
    for c in (shutil.which("soffice"), r"C:\Program Files\LibreOffice\program\soffice.exe",
              r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"):
        if c and Path(c).exists():
            return c
    return None

def wordcraft() -> str | None:
    """WordCraft (editor de Word livre, em Rust): converte DOCX/DOC/ODT/RTF/MD/HTML sem Word nem LibreOffice."""
    aqui = Path(__file__).resolve().parent
    nomes = ["wordcraft-cli.exe", "wordcraft-cli"]
    locais = [aqui / "wordcraft" / n for n in nomes] + [aqui / n for n in nomes]
    if os.name == "nt":
        locais.append(Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "ArtCraft" / "WordCraft" / "wordcraft-cli.exe")
        locais.append(Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "ArtCraft" / "WordCraft" / "wordcraft-cli.exe")
    for c in locais:
        if c.exists():
            return str(c)
    pasta = aqui / "wordcraft"  # o zip portátil pode vir com uma subpasta
    if pasta.is_dir():
        for c in pasta.rglob("wordcraft-cli*"):
            if c.is_file() and c.suffix.lower() in ("", ".exe"):
                return str(c)
    return shutil.which("wordcraft-cli")

def wc_converter(ext: str, sufixo: str = "", extra: list[str] | None = None) -> Callable[[Path], list[Path]]:
    def run(src: Path) -> list[Path]:
        exe = wordcraft()
        if not exe:
            raise RuntimeError("WordCraft não instalado (rode o instalar.bat de novo)")
        dst = saida(src, ext, sufixo)
        flags = 0x08000000 if os.name == "nt" else 0
        r = subprocess.run([exe, "convert", str(src), str(dst), *(extra or [])], capture_output=True, text=True, creationflags=flags, timeout=300)
        if r.returncode != 0 or not dst.exists():
            dst.unlink(missing_ok=True)
            raise RuntimeError((r.stderr or r.stdout).strip().splitlines()[-1] if (r.stderr or r.stdout).strip() else "WordCraft falhou")
        return [dst]
    return run

def word_pdf(src: Path) -> list[Path]:
    """Word → PDF. Usa o melhor disponível: 1) Microsoft Word, 2) WordCraft, 3) LibreOffice, 4) conversor próprio."""
    dst = saida(src, "pdf")
    if os.name == "nt":  # 1) Word instalado → fidelidade total
        try:
            from docx2pdf import convert
            convert(str(src), str(dst))
            if dst.exists():
                return [dst]
        except Exception:
            pass
    if wordcraft():  # 2) WordCraft (vem com o Gomos) → fiel ao Word, rápido, sem instalar nada
        try:
            dst.unlink(missing_ok=True)
            return wc_converter("pdf")(src)
        except Exception:
            dst = saida(src, "pdf")
    so = _soffice()  # 3) LibreOffice (grátis) → quase idêntico ao Word
    if so:
        tmp = Path(tempfile.mkdtemp())
        flags = 0x08000000 if os.name == "nt" else 0
        subprocess.run([so, "--headless", "--convert-to", "pdf", "--outdir", str(tmp), str(src)], capture_output=True, creationflags=flags, timeout=180)
        gerado = tmp / (src.stem + ".pdf")
        if gerado.exists():
            shutil.move(str(gerado), dst); shutil.rmtree(tmp, ignore_errors=True); return [dst]
        shutil.rmtree(tmp, ignore_errors=True)
    if src.suffix.lower() != ".docx":
        raise RuntimeError("para .doc/.odt/.rtf é preciso o WordCraft, o LibreOffice ou o Word")
    # 4) sem Word nem LibreOffice: DOCX → HTML (títulos, negrito, listas, tabelas, imagens) → PDF A4
    import mammoth, base64, re
    with open(src, "rb") as f:
        html = mammoth.convert_to_html(f).value
    pymupdf = _pdf()
    imagens = {}
    def _img(m):  # imagens embutidas viram arquivos do "arquivo virtual" do PyMuPDF
        nome = f"img{len(imagens)}.{m.group(1).split('/')[-1]}"
        imagens[nome] = base64.b64decode(m.group(2)); return f'src="{nome}"'
    html = re.sub(r'src="data:(image/[a-z+]+);base64,([^"]+)"', _img, html)
    css = ("body{font-family:sans-serif;font-size:11pt;line-height:1.35} h1{font-size:20pt} h2{font-size:16pt} h3{font-size:13pt}"
           " table{border-collapse:collapse;width:100%} td,th{border:1px solid #888;padding:2px 4px} td p,th p{margin:0} p{margin:0 0 6pt 0} img{max-width:100%}")
    arq = pymupdf.Archive()
    for nome, dados in imagens.items():
        arq.add(dados, nome)
    story = pymupdf.Story(html=f"<body>{html}</body>", user_css=css, archive=arq)
    escritor = pymupdf.DocumentWriter(str(dst))
    a4 = pymupdf.paper_rect("a4"); area = a4 + (56, 56, -56, -56)
    mais = True
    while mais:
        dispositivo = escritor.begin_page(a4)
        mais, _ = story.place(area)
        story.draw(dispositivo)
        escritor.end_page()
    escritor.close()
    return [dst]

def pdf_word(src: Path) -> list[Path]:
    """PDF → Word (.docx) editável, mantendo parágrafos, tabelas, imagens e o layout das páginas."""
    import logging
    logging.disable(logging.CRITICAL)
    with abrir_pdf(src) as d:  # valida senha/páginas antes e detecta PDF escaneado
        escaneado = not any(pg.get_text().strip() for pg in d)
    dst = saida(src, "docx")
    try:
        from pdf2docx import Converter
        cv = Converter(str(src), password=_SENHAS.get(str(src)))
        try:
            cv.convert(str(dst))
        finally:
            cv.close()
    except Exception:
        dst.unlink(missing_ok=True)
        _pdf_word_simples(src, dst)  # plano B: texto por página + imagem da página
        AVISOS.append(f"{src.name}: layout complexo — gerei um Word simplificado (texto + imagem de cada página)")
    if escaneado:
        AVISOS.append(f"{src.name}: PDF escaneado — o Word tem as páginas como imagem (texto não editável sem OCR)")
    return [dst]

def _pdf_word_simples(src: Path, dst: Path):
    import docx, io
    from docx.shared import Inches
    d = docx.Document()
    with abrir_pdf(src) as doc:
        for i, pg in enumerate(doc):
            if i:
                d.add_page_break()
            texto = pg.get_text().strip()
            for par in [p for p in texto.split("\n\n") if p.strip()]:
                d.add_paragraph(par.replace("\n", " "))
            if not texto or pg.get_images():
                png = pg.get_pixmap(dpi=110).tobytes("png")
                d.add_picture(io.BytesIO(png), width=Inches(6))
    d.save(dst)

def texto_pdf(src: Path) -> list[Path]:
    pymupdf = _pdf()
    doc = pymupdf.open()
    txt = src.read_text(encoding="utf-8", errors="replace")
    rect = pymupdf.paper_rect("a4")
    pg = None
    linhas = txt.splitlines() or [""]
    for i in range(0, len(linhas), 60):  # 60 linhas por página
        pg = doc.new_page(width=rect.width, height=rect.height)
        pg.insert_textbox(rect + (40, 40, -40, -40), "\n".join(linhas[i:i + 60]), fontsize=10)
    dst = saida(src, "pdf"); doc.save(dst); doc.close(); return [dst]

# ---------------------------------------------------------------- cruzadas: PDF ⇄ Word ⇄ Excel ⇄ Imagem
def _numero(v):
    """'12' → 12, '340,50' / '340.50' → 340.5 (Excel entende como número); o resto fica texto."""
    if not isinstance(v, str):
        return v
    t = v.strip().replace("R$", "").strip()
    if t.isdigit() and (t.startswith("0") or len(t) >= 10):  # telefone, CPF, CEP: manter como texto
        return t
    try:
        if t and t.replace(".", "").replace(",", "").replace("-", "").isdigit():
            if "," in t:
                t = t.replace(".", "").replace(",", ".")
            return int(t) if t.lstrip("-").isdigit() else float(t)
    except ValueError:
        pass
    return v.strip()

def _salvar_xlsx(folhas: list[tuple[str, list[list]]], dst: Path):
    import openpyxl
    from openpyxl.styles import Font
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    usados = set()
    for nome, linhas in folhas or [("Planilha", [[""]])]:
        nome = (str(nome)[:28] or "Planilha")
        base, i = nome, 2
        while nome in usados:
            nome = f"{base} {i}"; i += 1
        usados.add(nome)
        ws = wb.create_sheet(nome)
        from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
        for r in linhas:  # remove caracteres de controle que o Excel não aceita (comum em PDFs em árabe)
            ws.append([ILLEGAL_CHARACTERS_RE.sub("", v) if isinstance(v, str) else v for v in (_numero(x) for x in r)])
        if linhas:
            for cel in ws[1]:
                cel.font = Font(bold=True)
        for col in ws.columns:  # largura automática
            ws.column_dimensions[col[0].column_letter].width = min(60, max(8, *(len(str(x.value or "")) + 2 for x in col)))
    wb.save(dst)

def pdf_excel(src: Path) -> list[Path]:
    """PDF → Excel: cada tabela do PDF vira uma aba; sem tabelas, cada linha de texto vira uma linha."""
    folhas = []
    with abrir_pdf(src) as doc:
        for n, pg in enumerate(doc, 1):
            try:
                tabelas = pg.find_tables().tables
            except Exception:
                tabelas = []
            for k, t in enumerate(tabelas, 1):
                # texto lido pela área de cada célula (o extract() às vezes quebra palavras no meio)
                linhas = []
                for r in t.rows:
                    linhas.append([" ".join(pg.get_text("text", clip=cel).split()) if cel else "" for cel in r.cells])
                if any(any(c for c in r) for r in linhas):
                    folhas.append((f"Pág {n} tabela {k}", linhas))
        if not folhas:  # PDF sem tabela desenhada: colunas separadas por espaços largos
            import re
            for n, pg in enumerate(doc, 1):
                linhas = [re.split(r"\s{2,}|\t", l.strip()) for l in pg.get_text().splitlines() if l.strip()]
                if linhas:
                    folhas.append((f"Pág {n}", linhas))
    if not folhas:  # PDF escaneado: lê as páginas com OCR
        try:
            import ocr
            from PIL import Image
            with abrir_pdf(src) as doc:
                for n, pg in enumerate(doc, 1):
                    pix = pg.get_pixmap(dpi=200)
                    linhas = ocr.ler_tabela(Image.open(io.BytesIO(pix.tobytes("png"))))
                    if linhas:
                        folhas.append((f"Pág {n}", linhas))
            if folhas:
                AVISOS.append(f"{src.name}: PDF escaneado lido por OCR — confira os valores")
        except Exception as e:
            AVISOS.append(f"{src.name}: PDF escaneado e OCR indisponível ({e})")
    if not folhas:
        AVISOS.append(f"{src.name}: PDF sem texto legível — planilha vazia")
    dst = saida(src, "xlsx"); _salvar_xlsx(folhas, dst); return [dst]

def _como_docx(src: Path) -> Path:
    """DOC/ODT/RTF → DOCX temporário (via WordCraft ou LibreOffice) para ler tabelas."""
    if src.suffix.lower() == ".docx":
        return src
    tmp = Path(tempfile.mkdtemp()) / (src.stem + ".docx")
    exe = wordcraft()
    if exe:
        subprocess.run([exe, "convert", str(src), str(tmp)], capture_output=True, creationflags=0x08000000 if os.name == "nt" else 0)
    elif _soffice():
        subprocess.run([_soffice(), "--headless", "--convert-to", "docx", "--outdir", str(tmp.parent), str(src)], capture_output=True)
    if not tmp.exists():
        raise RuntimeError("para ler .doc/.odt/.rtf é preciso o WordCraft ou o LibreOffice")
    return tmp

def word_excel(src: Path) -> list[Path]:
    """Word → Excel: cada tabela do documento vira uma aba; sem tabelas, os parágrafos viram linhas."""
    import docx
    d = docx.Document(_como_docx(src))
    folhas = [(f"Tabela {i}", [[cel.text.strip() for cel in r.cells] for r in t.rows]) for i, t in enumerate(d.tables, 1)]
    if not folhas:
        folhas = [("Texto", [[p.text] for p in d.paragraphs if p.text.strip()])]
    dst = saida(src, "xlsx"); _salvar_xlsx(folhas, dst); return [dst]

def _pdf_temp(fn, src: Path) -> Path:
    """Roda uma conversão que gera PDF numa pasta temporária (para depois virar imagem)."""
    tmpdir = Path(tempfile.mkdtemp()); tmp_src = tmpdir / src.name
    shutil.copy2(src, tmp_src)
    return fn(tmp_src)[0]

def _paginas_png(pdf: Path, src: Path) -> list[Path]:
    pymupdf = _pdf(); out = []
    with pymupdf.open(pdf) as doc:
        for i, pg in enumerate(doc, 1):
            dst = saida(src, "png", f" - pág {i}" if doc.page_count > 1 else "")
            pg.get_pixmap(dpi=150).save(dst); out.append(dst)
    return out

def word_paginas(src: Path) -> list[Path]:
    return _paginas_png(_pdf_temp(word_pdf, src), src)

def _tabelas_html(src: Path) -> str:
    import html
    partes = []
    for nome, linhas in _ler_planilha(src).items():
        linhas = [r for r in linhas if any(v not in (None, "") for v in r)]
        if not linhas:
            continue
        cab = "".join(f"<th>{html.escape(str('' if v is None else v))}</th>" for v in linhas[0])
        corpo = "".join("<tr>" + "".join(f"<td>{html.escape(str('' if v is None else v))}</td>" for v in r) + "</tr>" for r in linhas[1:])
        partes.append(f"<h2>{html.escape(str(nome))}</h2><table><tr>{cab}</tr>{corpo}</table>")
    return "".join(partes) or "<p>(planilha vazia)</p>"

def excel_pdf(src: Path) -> list[Path]:
    """Excel/CSV → PDF: cada aba vira uma tabela, páginas A4 deitadas, quebra automática."""
    pymupdf = _pdf()
    css = ("body{font-family:sans-serif;font-size:9pt} h2{font-size:12pt;margin:8pt 0 4pt 0} table{border-collapse:collapse;width:100%}"
           " th{background:#ffe8cc;font-weight:bold} th,td{border:1px solid #999;padding:2px 4px}")
    story = pymupdf.Story(html=f"<body>{_tabelas_html(src)}</body>", user_css=css)
    dst = saida(src, "pdf"); w = pymupdf.DocumentWriter(str(dst))
    pagina = pymupdf.paper_rect("a4-l"); area = pagina + (36, 36, -36, -36); mais = True
    while mais:
        dev = w.begin_page(pagina); mais, _ = story.place(area); story.draw(dev); w.end_page()
    w.close(); return [dst]

def excel_word(src: Path) -> list[Path]:
    """Excel/CSV → Word: cada aba vira um título + tabela formatada."""
    import docx
    from docx.enum.section import WD_ORIENT
    d = docx.Document()
    sec = d.sections[0]; sec.orientation = WD_ORIENT.LANDSCAPE; sec.page_width, sec.page_height = sec.page_height, sec.page_width
    for nome, linhas in _ler_planilha(src).items():
        linhas = [r for r in linhas if any(v not in (None, "") for v in r)]
        if not linhas:
            continue
        d.add_heading(str(nome), 2)
        ncol = max(len(r) for r in linhas)
        t = d.add_table(rows=len(linhas), cols=ncol); t.style = "Table Grid"
        for i, r in enumerate(linhas):
            for j in range(ncol):
                v = r[j] if j < len(r) else ""
                t.cell(i, j).text = "" if v is None else str(v)
                if i == 0:
                    for run in t.cell(i, j).paragraphs[0].runs:
                        run.bold = True
    dst = saida(src, "docx"); d.save(dst); return [dst]

def excel_imagem(src: Path) -> list[Path]:
    return _paginas_png(_pdf_temp(excel_pdf, src), src)

def _png_temp(src: Path) -> Path:
    im = _abrir_imagem(src)
    tmp = Path(tempfile.mkdtemp()) / (src.stem + ".png")
    (im if im.mode in ("RGB", "RGBA", "L") else im.convert("RGBA")).save(tmp)
    return tmp

def img_word(src: Path) -> list[Path]:
    """Imagem → Word: a foto ocupando a largura da página (para anotar/imprimir)."""
    import docx
    from docx.shared import Inches
    from PIL import Image
    png = _png_temp(src)
    with Image.open(png) as im:
        deitada = im.width > im.height
    d = docx.Document()
    if deitada:
        from docx.enum.section import WD_ORIENT
        sec = d.sections[0]; sec.orientation = WD_ORIENT.LANDSCAPE; sec.page_width, sec.page_height = sec.page_height, sec.page_width
    d.add_picture(str(png), width=Inches(9 if deitada else 6.3))
    d.add_paragraph(src.name)
    dst = saida(src, "docx"); d.save(dst); return [dst]

def img_excel(src: Path) -> list[Path]:
    """Imagem → Excel: lê a tabela da imagem (OCR) e põe cada valor na sua célula.
    A imagem original fica numa segunda aba para conferência."""
    import openpyxl
    from openpyxl.drawing.image import Image as XImg
    png = _png_temp(src)
    linhas = []
    try:
        import ocr
        linhas = ocr.ler_tabela(_abrir_imagem(src))
    except Exception as e:
        AVISOS.append(f"{src.name}: não consegui ler o texto ({e}); a planilha tem só a imagem")
    dst = saida(src, "xlsx")
    if linhas:
        _salvar_xlsx([("Dados", linhas)], dst)
        wb = openpyxl.load_workbook(dst)
        AVISOS.append(f"{src.name}: lido por OCR — confira e-mails, números e nomes antes de usar")
    else:
        wb = openpyxl.Workbook(); wb.remove(wb.active)
        if not AVISOS or src.name not in AVISOS[-1]:
            AVISOS.append(f"{src.name}: não encontrei texto na imagem; a planilha tem só a imagem")
    ws = wb.create_sheet("Imagem original")
    ws["A1"] = src.name
    img = XImg(str(png))
    if img.width > 900:
        k = 900 / img.width; img.width, img.height = int(img.width * k), int(img.height * k)
    ws.add_image(img, "A2")
    wb.save(dst); return [dst]

def img_texto(src: Path) -> list[Path]:
    """Imagem → texto (OCR)."""
    import ocr
    dst = saida(src, "txt"); dst.write_text(ocr.ler_texto(_abrir_imagem(src)), encoding="utf-8"); return [dst]

# ---------------------------------------------------------------- catálogo de gomos
Gomo = tuple[str, str, Callable[[Path], list[Path]]]  # (ícone, rótulo, ação)

def gomos(p: Path) -> list[Gomo]:
    t = tipo(p)
    e = p.suffix.lower().lstrip(".")
    if t == "imagem":
        alvos = [("📷", "JPG", "jpg"), ("🖼", "PNG", "png"), ("🪶", "WEBP", "webp"), ("📱", "HEIC", "heic"), ("🗂", "TIFF", "tiff"),
                 ("🧱", "BMP", "bmp"), ("✨", "AVIF", "avif"), ("🎞", "GIF", "gif"), ("🔖", "ICO", "ico"), ("📄", "PDF", "pdf")]
        g = [(i, r, img_para(x)) for i, r, x in alvos if x != e and not (x == "jpg" and e in ("jpeg", "jfif")) and not (x == "tiff" and e == "tif")]
        g += [("📘", "Word (DOCX)", img_word), ("📊", "Excel (XLSX)", img_excel), ("🔤", "Texto (OCR)", img_texto)]
        return g + [("↘", "Reduzir 50%", img_para("mesmo", 0.5, " - 50%")), ("🕶", "Sem metadados", img_para("mesmo", 1, " - limpo", limpar=True))]
    if t == "audio":
        g = [("🎵", "MP3", av("mp3")), ("〰", "WAV", av("wav")), ("🍏", "M4A", av("m4a")), ("🔊", "OGG", av("ogg")),
             ("🎧", "OPUS", av("opus")), ("💎", "FLAC", av("flac"))]
        return [x for x in g if x[1].lower() != e]
    if t == "video":
        g = [("🎞", "MP4", av("mp4")), ("📉", "MP4 leve", av("mp4-leve", "mp4", " - leve")), ("🌐", "WEBM", av("webm")),
             ("🍎", "MOV", av("mov")), ("📼", "AVI", av("avi")), ("📦", "MKV", av("mkv")), ("🎡", "GIF", av("gif")),
             ("🎵", "Áudio MP3", av("mp3", "mp3")), ("〰", "Áudio WAV", av("wav", "wav")), ("📷", "1º quadro", primeiro_quadro)]
        return [x for x in g if x[1].lower() != e]
    if t == "pdf":
        extra = [("🔓", "Remover senha", pdf_sem_senha)] if pdf_tem_senha(p) else []
        return extra + [("📘", "Word (DOCX)", pdf_word), ("📊", "Excel (XLSX)", pdf_excel), ("🖼", "Páginas PNG", pdf_imagens("png")), ("📷", "Páginas JPG", pdf_imagens("jpg")), ("📝", "Texto TXT", pdf_texto),
                ("🗜", "Comprimir", pdf_comprimir), ("✂", "Dividir", pdf_dividir), ("↻", "Girar 90°", pdf_girar)]
    if t in ("planilha", "csv"):
        g = [("📄", "PDF", excel_pdf), ("📘", "Word (DOCX)", excel_word), ("🖼", "Imagem PNG", excel_imagem),
             ("🧾", "CSV", plan_csv), ("📊", "XLSX", plan_xlsx), ("{ }", "JSON", plan_json), ("🌐", "HTML", plan_html)]
        return [x for x in g if x[1].lower() != e]
    if t == "word":
        g = [("📄", "PDF", word_pdf), ("📊", "Excel (XLSX)", word_excel), ("🖼", "Páginas PNG", word_paginas)]
        if wordcraft():  # todas as derivações de documento
            g += [(i, r, wc_converter(x)) for i, r, x in [("📘", "DOCX", "docx"), ("📗", "ODT", "odt"), ("📙", "RTF", "rtf"),
                  ("🌐", "HTML", "html"), ("Ⓜ", "Markdown", "md"), ("📝", "TXT", "txt")] if x != e]
            g.append(("✍", "PDF c/ revisões", wc_converter("pdf", " - revisões", ["--markup"])))  # comentários e alterações controladas
            return g
        return g + ([("📝", "TXT", word_texto("txt")), ("Ⓜ", "Markdown", word_texto("md"))] if e == "docx" else [])
    if t == "texto":
        g = [("📄", "PDF", texto_pdf)]
        if wordcraft() and e in ("md", "markdown", "txt"):
            g = [("📄", "PDF", wc_converter("pdf")), ("📘", "Word (DOCX)", wc_converter("docx")), ("📗", "ODT", wc_converter("odt")), ("🌐", "HTML", wc_converter("html"))]
        return g
    return []
