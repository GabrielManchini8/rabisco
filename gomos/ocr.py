"""
OCR de tabelas (Tesseract, 100% local): imagem/print/PDF escaneado → linhas e colunas.
As colunas são encontradas pelos "corredores" verticais vazios que atravessam todas as linhas —
funciona mesmo em prints de planilha SEM linhas de grade.
"""
from __future__ import annotations
import os, re, shutil, subprocess, tempfile, csv, io
from pathlib import Path
from statistics import median

AQUI = Path(__file__).resolve().parent
SEM_JANELA = 0x08000000 if os.name == "nt" else 0

def tesseract() -> str | None:
    locais = [AQUI / "tesseract" / "tesseract.exe", AQUI / "tesseract" / "bin" / "tesseract.exe",
              Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Tesseract-OCR" / "tesseract.exe"]
    for c in locais:
        if c.exists():
            return str(c)
    return shutil.which("tesseract")

def _tessdata() -> str | None:
    for d in (AQUI / "tesseract" / "tessdata", AQUI / "tesseract" / "share" / "tessdata"):
        if d.is_dir():
            return str(d)
    return None

def _idiomas(exe: str) -> str:
    env = dict(os.environ)
    if _tessdata(): env["TESSDATA_PREFIX"] = _tessdata()
    try:
        out = subprocess.run([exe, "--list-langs"], capture_output=True, text=True, env=env, creationflags=SEM_JANELA).stdout
    except Exception:
        return "eng"
    tem = set(out.split())
    return "+".join(l for l in ("por", "eng") if l in tem) or "eng"

def _palavras(img) -> list[dict]:
    """Roda o Tesseract e devolve cada palavra com sua caixa (em pixels da imagem ampliada)."""
    exe = tesseract()
    if not exe:
        raise RuntimeError("OCR indisponível (Tesseract não encontrado)")
    env = dict(os.environ)
    if _tessdata(): env["TESSDATA_PREFIX"] = _tessdata()
    tmp = Path(tempfile.mkdtemp()) / "ocr.png"
    img.save(tmp)
    r = subprocess.run([exe, str(tmp), "stdout", "-l", _idiomas(exe), "--psm", "6", "-c", "preserve_interword_spaces=1", "tsv"],
                       capture_output=True, env=env, creationflags=SEM_JANELA)
    shutil.rmtree(tmp.parent, ignore_errors=True)
    if r.returncode != 0:
        raise RuntimeError("OCR falhou: " + r.stderr.decode("utf-8", "replace").strip()[-200:])
    linhas = list(csv.DictReader(io.StringIO(r.stdout.decode("utf-8", "replace")), delimiter="\t", quoting=csv.QUOTE_NONE))
    pal = []
    for l in linhas:
        t = (l.get("text") or "").strip()
        if not t or l.get("level") != "5":
            continue
        try:
            if float(l.get("conf", -1)) < 0:
                continue
        except ValueError:
            pass
        x, y, w, h = (int(l[k]) for k in ("left", "top", "width", "height"))
        if t in ("|", "!", "I") and w < h * 0.25:  # traço de borda lido como letra
            continue
        pal.append({"t": t, "x": x, "y": y, "w": w, "h": h})
    return pal

def _preparar(img):
    from PIL import Image, ImageOps
    img = ImageOps.exif_transpose(img).convert("L")
    # texto de print costuma ter ~10 px de altura: ampliar ajuda muito o Tesseract
    k = 3 if img.width < 2200 else (2 if img.width < 4000 else 1)
    if k > 1:
        img = img.resize((img.width * k, img.height * k), Image.LANCZOS)
    return img

DOMINIO = re.compile(r"(gmail|hotmail|yahoo|outlook|live|bol|uol|icloud|terra)\s*[.,]\s*com(?:\s*[.,]\s*br)?\b", re.I)
EMAIL_OK = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
# como o Tesseract costuma ler o "@" em prints pequenos
PARES_ARROBA = ("GQ", "OE", "(O", "QG", "OG", "Q(", "©G")

def _corrigir_email(t: str) -> str:
    if EMAIL_OK.search(t):
        return t
    m = DOMINIO.search(t)
    if not m or m.start() == 0:
        return t
    pre = t[:m.start()].rstrip().rstrip("([{©®").rstrip()  # "fulano (gmail.com": o "(" era o "@"
    dom = re.sub(r"\s+", "", m.group(0)).replace(",", ".")
    # separa o que vem antes (ex.: telefone) do usuário do e-mail
    partes = pre.rsplit(" ", 1)
    antes, usuario = (partes[0] + " ", partes[1]) if len(partes) == 2 else ("", partes[0])
    if not usuario:
        return t
    # remove o "@" mal lido: 1 caractere sempre; 2 quando é um par típico de erro
    if usuario[-2:].upper() in PARES_ARROBA and len(usuario) > 3:
        usuario = usuario[:-2]
    elif len(usuario) > 1:
        ult, colado = usuario[-1], t[m.start() - 1:m.start()] != " "
        if not ult.isascii() or ult in "Qq©®(@":            # nunca termina um e-mail: é o "@" mal lido
            usuario = usuario[:-1]
        elif ult in "GgOo0" and colado:                       # "POCOSGGMAIL" → "POCOS" + "@GMAIL"
            usuario = usuario[:-1]
        elif ult.isupper() and usuario[:-1].islower():        # "fulanoQ gmail" (maiúscula solta no fim)
            usuario = usuario[:-1]
    usuario = usuario.rstrip("(").strip()
    return f"{antes}{usuario}@{dom}"

def _limpar(t: str) -> str:
    t = re.sub(r"\s{2,}", " ", t).strip(" |")
    if re.fullmatch(r"[\s\-—–_|.·:;,~=]*", t):   # sobra de borda/traço lida como texto
        return ""
    t = re.sub(r"(\w)\s*@\s*(\w)", r"\1@\2", t)  # "fulano @ gmail" → "fulano@gmail"
    return _corrigir_email(t)

TELEFONE = re.compile(r"^\+?\(?\d[\d\s().-]{7,}\d$")
CODIGO_E_TEXTO = re.compile(r"^(\d{1,7})\s+(\D.*)$")
TEL_E_EMAIL = re.compile(r"^(\+?[\d\s().-]{8,}?)\s+(\S+@\S+)$")

def _separar_colunas(tabela: list[list[str]]) -> list[list[str]]:
    """Desgruda colunas que ficaram juntas no print: [código + nome] e [telefone + e-mail]."""
    if not tabela:
        return tabela
    ncol = max(len(r) for r in tabela)
    tabela = [r + [""] * (ncol - len(r)) for r in tabela]
    novas = [[] for _ in tabela]
    for k in range(ncol):
        col = [r[k] for r in tabela]
        cheias = [v for v in col if v]
        cod = [v for v in cheias if CODIGO_E_TEXTO.match(v)]
        emails = [v for v in cheias if "@" in v]
        tels = [v for v in cheias if TELEFONE.match(v) or TEL_E_EMAIL.match(v)]
        if cheias and len(cod) >= 0.6 * len(cheias):          # "4965 CARLOS" → "4965" | "CARLOS"
            for i, v in enumerate(col):
                m = CODIGO_E_TEXTO.match(v)
                novas[i] += [m.group(1), m.group(2)] if m else ([v, ""] if v.isdigit() else ["", v])
        elif emails and tels and len(emails) + len(tels) >= 0.8 * len(cheias):  # telefone | e-mail
            # se a coluna da esquerda já é de telefone, o telefone grudado vai para ela (quando vazia)
            esq = [r[-1] for r in novas] if novas and novas[0] else []
            esq_tel = esq and [v for v in esq if v] and all(TELEFONE.match(v) for v in esq if v)
            so_email = all("@" in v or TEL_E_EMAIL.match(v) for v in cheias)
            if esq_tel and so_email:
                for i, v in enumerate(col):
                    m = TEL_E_EMAIL.match(v)
                    if m and not novas[i][-1]:
                        novas[i][-1] = m.group(1).strip(); novas[i].append(m.group(2))
                    else:
                        novas[i].append(v)
            else:
                for i, v in enumerate(col):
                    m = TEL_E_EMAIL.match(v)
                    if m: novas[i] += [m.group(1).strip(), m.group(2)]
                    elif "@" in v: novas[i] += ["", v]
                    else: novas[i] += [v, ""]
        else:
            for i, v in enumerate(col):
                novas[i].append(v)
    return novas

def ler_tabela(img) -> list[list[str]]:
    """Imagem (PIL) → lista de linhas, cada uma com o texto de cada coluna."""
    img = _preparar(img)
    pal = _palavras(img)
    if not pal:
        return []
    hmed = median(p["h"] for p in pal)
    # 1) linhas: agrupa pelo centro vertical
    pal.sort(key=lambda p: p["y"] + p["h"] / 2)
    linhas, atual, ult = [], [], None
    for p in pal:
        cy = p["y"] + p["h"] / 2
        if ult is not None and cy - ult > hmed * 0.6:
            linhas.append(atual); atual = []
        atual.append(p); ult = cy if ult is None or not atual[:-1] else (ult * (len(atual) - 1) + cy) / len(atual)
    linhas.append(atual)
    # 2) células: dentro da linha, separa onde o espaço entre palavras é maior que um espaço normal
    lim = hmed * 0.75
    celulas = []  # (linha, x0, x1, texto)
    for i, ln in enumerate(linhas):
        ln.sort(key=lambda p: p["x"])
        grupo = [ln[0]]
        for p in ln[1:]:
            ant = grupo[-1]
            if p["x"] - (ant["x"] + ant["w"]) > lim:
                celulas.append((i, grupo[0]["x"], grupo[-1]["x"] + grupo[-1]["w"], " ".join(g["t"] for g in grupo)))
                grupo = []
            grupo.append(p)
        celulas.append((i, grupo[0]["x"], grupo[-1]["x"] + grupo[-1]["w"], " ".join(g["t"] for g in grupo)))
    # 3) colunas: corredores verticais vazios em TODAS as linhas
    largura = max(c[2] for c in celulas) + 2
    ocupado = bytearray(largura)
    for _, x0, x1, _ in celulas:
        ocupado[x0:x1] = b"\x01" * (x1 - x0)
    cols, x = [], 0
    while x < largura:
        if ocupado[x]:
            ini = x
            while x < largura and ocupado[x]: x += 1
            cols.append((ini, x))
        x += 1
    def coluna(x0, x1):
        meio = (x0 + x1) / 2
        return min(range(len(cols)), key=lambda k: 0 if cols[k][0] <= meio <= cols[k][1] else min(abs(meio - cols[k][0]), abs(meio - cols[k][1])))
    tabela = [[""] * len(cols) for _ in linhas]
    for i, x0, x1, t in celulas:
        k = coluna(x0, x1)
        tabela[i][k] = (tabela[i][k] + " " + t).strip()
    tabela = _separar_colunas([[_limpar(v) for v in r] for r in tabela])
    # tira colunas totalmente vazias
    usadas = [k for k in range(len(tabela[0]) if tabela else 0) if any(r[k] for r in tabela)]
    return [[r[k] for k in usadas] for r in tabela if any(r)]

def ler_texto(img) -> str:
    return "\n".join(" ".join(v for v in r if v) for r in ler_tabela(img))
