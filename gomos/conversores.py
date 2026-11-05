"""
Motor de conversão do Gomos — tudo local, sem internet.
Cada tipo de arquivo tem uma lista de "gomos" (ações). Cada ação gera arquivo(s)
novo(s) ao lado do original, sem nunca sobrescrever nada.
"""
from __future__ import annotations
import os, subprocess, json, csv, shutil
from pathlib import Path
from typing import Callable

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

# ---------------------------------------------------------------- tipos
IMG = {"jpg", "jpeg", "jfif", "png", "webp", "heic", "heif", "tif", "tiff", "bmp", "gif", "avif", "ico", "psd", "tga", "dds", "pcx", "jp2"}
AUD = {"mp3", "wav", "m4a", "aac", "ogg", "oga", "opus", "flac", "wma", "amr", "aiff", "aif", "caf", "ac3"}
VID = {"mp4", "m4v", "mov", "avi", "mkv", "wmv", "flv", "3gp", "webm", "mpeg", "mpg", "ts", "mts", "m2ts", "vob", "ogv"}
PDF = {"pdf"}
XLS = {"xlsx", "xlsm", "xls", "ods"}
CSV = {"csv", "tsv"}
DOC = {"docx"}
TXT = {"txt", "md", "markdown", "json", "log"}

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

def pdf_imagens(ext: str) -> Callable[[Path], list[Path]]:
    def run(src: Path) -> list[Path]:
        pymupdf = _pdf()
        out = []
        with pymupdf.open(src) as doc:
            for i, pg in enumerate(doc, 1):
                pix = pg.get_pixmap(dpi=150)
                dst = saida(src, ext, f" - pág {i}")
                pix.save(dst, jpg_quality=90) if ext == "jpg" else pix.save(dst)
                out.append(dst)
        return out
    return run

def pdf_texto(src: Path) -> list[Path]:
    pymupdf = _pdf()
    with pymupdf.open(src) as doc:
        txt = "\n\n".join(f"--- Página {i} ---\n{pg.get_text()}" for i, pg in enumerate(doc, 1))
    dst = saida(src, "txt"); dst.write_text(txt, encoding="utf-8"); return [dst]

def pdf_comprimir(src: Path) -> list[Path]:
    pymupdf = _pdf()
    dst = saida(src, "pdf", " - comprimido")
    with pymupdf.open(src) as doc:
        try:  # reduz imagens internas para 150 dpi
            doc.rewrite_images(dpi_threshold=200, dpi_target=150, quality=75)
        except Exception:
            pass
        doc.save(dst, garbage=4, deflate=True, clean=True)
    return [dst]

def pdf_dividir(src: Path) -> list[Path]:
    pymupdf = _pdf()
    out = []
    with pymupdf.open(src) as doc:
        for i in range(doc.page_count):
            novo = pymupdf.open(); novo.insert_pdf(doc, from_page=i, to_page=i)
            dst = saida(src, "pdf", f" - pág {i + 1}"); novo.save(dst); novo.close(); out.append(dst)
    return out

def pdf_girar(src: Path) -> list[Path]:
    pymupdf = _pdf()
    dst = saida(src, "pdf", " - girado")
    with pymupdf.open(src) as doc:
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

# ---------------------------------------------------------------- catálogo de gomos
Gomo = tuple[str, str, Callable[[Path], list[Path]]]  # (ícone, rótulo, ação)

def gomos(p: Path) -> list[Gomo]:
    t = tipo(p)
    e = p.suffix.lower().lstrip(".")
    if t == "imagem":
        alvos = [("📷", "JPG", "jpg"), ("🖼", "PNG", "png"), ("🪶", "WEBP", "webp"), ("📱", "HEIC", "heic"), ("🗂", "TIFF", "tiff"),
                 ("🧱", "BMP", "bmp"), ("✨", "AVIF", "avif"), ("🎞", "GIF", "gif"), ("🔖", "ICO", "ico"), ("📄", "PDF", "pdf")]
        g = [(i, r, img_para(x)) for i, r, x in alvos if x != e and not (x == "jpg" and e in ("jpeg", "jfif")) and not (x == "tiff" and e == "tif")]
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
        return [("🖼", "Páginas PNG", pdf_imagens("png")), ("📷", "Páginas JPG", pdf_imagens("jpg")), ("📝", "Texto TXT", pdf_texto),
                ("🗜", "Comprimir", pdf_comprimir), ("✂", "Dividir", pdf_dividir), ("↻", "Girar 90°", pdf_girar)]
    if t in ("planilha", "csv"):
        g = [("🧾", "CSV", plan_csv), ("📊", "XLSX", plan_xlsx), ("{ }", "JSON", plan_json), ("🌐", "HTML", plan_html)]
        return [x for x in g if x[1].lower() != e]
    if t == "word":
        return [("📝", "TXT", word_texto("txt")), ("Ⓜ", "Markdown", word_texto("md"))]
    if t == "texto":
        return [("📄", "PDF", texto_pdf)]
    return []
