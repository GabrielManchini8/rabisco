"""
PORTÃO (gate) das conversões cruzadas PDF ⇄ Word ⇄ Excel ⇄ Imagem.
Não confia em "deu certo": abre cada arquivo gerado e confere o CONTEÚDO.
Saída 0 = verde (tudo passou). Saída 1 = vermelho (lista o que falhou).
Uso: python testes/portao.py
"""
import sys
try:  # console do Windows (cp1252) não imprime ✓/✗
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass
import sys, tempfile, traceback, logging
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)
import conversores as c

MARCA = "Tubo galvanizado"           # texto que precisa sobreviver a todas as conversões
LINHAS = [["Item", "Qtd", "Valor"], [MARCA, 12, 340.5], ["Válvula", 4, 120]]

def fixtures(d: Path) -> dict[str, Path]:
    import docx, openpyxl, pymupdf
    from PIL import Image, ImageDraw
    # Excel
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Estoque"
    for r in LINHAS: ws.append(r)
    wb.save(d / "planilha orçamento.xlsx")
    # Word com tabela
    doc = docx.Document(); doc.add_heading("Relatório", 1); doc.add_paragraph("Itens em estoque:")
    t = doc.add_table(rows=3, cols=3); t.style = "Table Grid"
    for i, r in enumerate(LINHAS):
        for j, v in enumerate(r): t.cell(i, j).text = str(v)
    doc.save(d / "relatório ação.docx")
    # PDF com tabela de verdade (gerado a partir de HTML)
    html = "<h1>Relatório</h1><table border=1>" + "".join("<tr>" + "".join(f"<td>{v}</td>" for v in r) + "</tr>" for r in LINHAS) + "</table>"
    story = pymupdf.Story(html=html, user_css="table{border-collapse:collapse} td{border:1px solid black;padding:4px}")
    import io
    buf = io.BytesIO(); w = pymupdf.DocumentWriter(buf); a4 = pymupdf.paper_rect("a4")
    dev = w.begin_page(a4); story.place(a4 + (50, 50, -50, -50)); story.draw(dev); w.end_page(); w.close()
    (d / "tabela situação.pdf").write_bytes(buf.getvalue())
    # Imagem
    im = Image.new("RGB", (400, 240), "#ff922b"); ImageDraw.Draw(im).rectangle((40, 40, 360, 200), outline="white", width=8)
    im.save(d / "foto câmera.png")
    return {"pdf": d / "tabela situação.pdf", "word": d / "relatório ação.docx", "excel": d / "planilha orçamento.xlsx", "imagem": d / "foto câmera.png"}

# ---------- verificadores: abrem o arquivo gerado e checam o conteúdo ----------
def texto_pdf(p):
    import pymupdf
    with pymupdf.open(p) as d: return "\n".join(pg.get_text() for pg in d)
def texto_docx(p):
    import docx
    D = docx.Document(p)
    return "\n".join([x.text for x in D.paragraphs] + [cl.text for t in D.tables for r in t.rows for cl in r.cells])
def celulas_xlsx(p):
    import openpyxl
    wb = openpyxl.load_workbook(p, data_only=True)
    return [str(v) for ws in wb.worksheets for r in ws.iter_rows(values_only=True) for v in r if v is not None]
def imagem_ok(p):
    from PIL import Image
    with Image.open(p) as im: im.verify(); return True
def docx_tem_imagem(p):
    import docx; return len(docx.Document(p).inline_shapes) > 0
def xlsx_tem_imagem(p):
    import openpyxl; return any(ws._images for ws in openpyxl.load_workbook(p).worksheets)
def pdf_tem_imagem(p):
    import pymupdf
    with pymupdf.open(p) as d: return any(pg.get_images() for pg in d)

TEM = lambda s: MARCA in s
CASOS = [  # (origem, rótulo do gomo, extensão esperada, verificação)
    ("pdf",    "Word (DOCX)",  "docx", lambda o: TEM(texto_docx(o))),
    ("pdf",    "Excel (XLSX)", "xlsx", lambda o: MARCA in celulas_xlsx(o) and "12" in [x.split(".")[0] for x in celulas_xlsx(o)]),
    ("pdf",    "Páginas PNG",  "png",  imagem_ok),
    ("pdf",    "Páginas JPG",  "jpg",  imagem_ok),
    ("word",   "PDF",          "pdf",  lambda o: TEM(texto_pdf(o))),
    ("word",   "Excel (XLSX)", "xlsx", lambda o: MARCA in celulas_xlsx(o)),
    ("word",   "Páginas PNG",  "png",  imagem_ok),
    ("excel",  "PDF",          "pdf",  lambda o: TEM(texto_pdf(o))),
    ("excel",  "Word (DOCX)",  "docx", lambda o: TEM(texto_docx(o))),
    ("excel",  "Imagem PNG",   "png",  imagem_ok),
    ("imagem", "PDF",          "pdf",  pdf_tem_imagem),
    ("imagem", "Word (DOCX)",  "docx", docx_tem_imagem),
    ("imagem", "Excel (XLSX)", "xlsx", xlsx_tem_imagem),
]

OCR_LINHAS = [["4965", "CARLOS DANIEL SANTOS", "MG", "31999869305", "daniel.pocos@gmail.com", "ativa"],
              ["4930", "CYNTIA APARECIDA", "MG", "31975222543", "cyntia@hotmail.com", "ativa"],
              ["13794", "EDMILSON FELIX", "SP", "31982507097", "edmilson@gmail.com", "Número"]]

def caso_ocr_tabela(d: Path):
    """Print de planilha SEM linhas de grade → Excel com cada valor na sua célula (OCR)."""
    from PIL import Image, ImageDraw, ImageFont
    fonte = None
    for f in ("arial.ttf", "DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf"):
        try: fonte = ImageFont.truetype(f, 15); break
        except OSError: pass
    xs = [10, 70, 300, 350, 470, 690]  # colunas alinhadas, sem bordas
    im = Image.new("RGB", (780, 30 + 22 * len(OCR_LINHAS)), "white"); dr = ImageDraw.Draw(im)
    for i, r in enumerate(OCR_LINHAS):
        for x, v in zip(xs, r): dr.text((x, 12 + 22 * i), v, fill="black", font=fonte)
    src = d / "print planilha.png"; im.save(src)
    g = {r: f for _, r, f in c.gomos(src)}
    out = g["Excel (XLSX)"](src)[0]
    import openpyxl
    ws = openpyxl.load_workbook(out).worksheets[0]
    linhas = [[("" if v is None else str(v)).strip() for v in r] for r in ws.iter_rows(values_only=True)]
    linhas = [[v for v in r if v] for r in linhas if any(r)]
    erros = [f"esperado {esp} / veio {got}" for esp, got in zip(OCR_LINHAS, linhas) if esp != got]
    if len(linhas) != len(OCR_LINHAS): erros.append(f"{len(linhas)} linhas, esperado {len(OCR_LINHAS)}")
    return erros

def caso_ocr_ajustes():
    """Leituras reais do Tesseract em prints de planilha (dados fictícios com o mesmo padrão)."""
    import ocr
    erros = []
    emails = {"fulanopocosQ gmail.com": "fulanopocos@gmail.com", "EMPRESAPOCOSGQHOTMAIL.COM": "EMPRESAPOCOS@HOTMAIL.COM",
              "JOAO.SILVA2412(OGMAIL.COM": "JOAO.SILVA2412@GMAIL.COM", "RIBEIROPOCOSGGMAIL.COM": "RIBEIROPOCOS@GMAIL.COM",
              "MGPOCOSARTOEGMAIL.COM": "MGPOCOSART@GMAIL.COM", "rm2091admç gmail.com": "rm2091adm@gmail.com",
              "certo@gmail.com": "certo@gmail.com", "rm2091adm @gmail.com": "rm2091adm@gmail.com",
              "ana @ hotmail.com": "ana@hotmail.com", "rm2091adm (gmail.com": "rm2091adm@gmail.com",
              "35999058277 rm2091adm (gmail.com": "35999058277 rm2091adm@gmail.com", "MGPOCOSARTOGMAIL.COM": "MGPOCOSART@GMAIL.COM", "—": "", "|": "", "-": ""}
    for lido, esperado in emails.items():
        if ocr._limpar(lido) != esperado: erros.append(f"e-mail {lido!r} → {ocr._limpar(lido)!r}, esperado {esperado!r}")
    # colunas grudadas no print: código+nome e telefone+e-mail
    t = [["4965 CARLOS SANTOS", "MG", "31999869305 carlos@gmail.com"], ["4930 ANA LIMA", "MG", "31975222543"],
         ["1815 JOSE LOPES 04496776642", "MG", "JOSE@HOTMAIL.COM"], ["13794 RITA PAZ", "SP", ""]]
    esp = [["4965", "CARLOS SANTOS", "MG", "31999869305", "carlos@gmail.com"], ["4930", "ANA LIMA", "MG", "31975222543", ""],
           ["1815", "JOSE LOPES 04496776642", "MG", "", "JOSE@HOTMAIL.COM"], ["13794", "RITA PAZ", "SP", "", ""]]
    veio = ocr._separar_colunas(t)
    if veio != esp: erros.append(f"colunas grudadas: veio {veio}")
    # Tesseract 5.5 (Windows): telefone grudado no e-mail, mas a coluna de telefone já existe à esquerda
    t2 = [["MG", "31999869305", "carlos@gmail.com"], ["MG", "31975222543", ""], ["MG", "", "35999058277 rm@gmail.com"]]
    esp2 = [["MG", "31999869305", "carlos@gmail.com"], ["MG", "31975222543", ""], ["MG", "35999058277", "rm@gmail.com"]]
    veio2 = ocr._separar_colunas(t2)
    if veio2 != esp2: erros.append(f"telefone para a coluna existente: veio {veio2}")
    return erros

def caso_caracteres_invalidos(d: Path):
    """Regressão: PDFs em árabe trazem caracteres de controle que o Excel recusa."""
    import pymupdf
    doc = pymupdf.open(); pg = doc.new_page()
    pg.insert_text((72, 72), "Item\x0b com \x01controle", fontsize=12); pg.insert_text((72, 100), MARCA, fontsize=12)
    src = d / "situação controle.pdf"; src.write_bytes(doc.tobytes()); doc.close()
    out = c.pdf_excel(src)[0]
    return any(MARCA in x for x in celulas_xlsx(out))

def main():
    d = Path(tempfile.mkdtemp(prefix="portao_"))
    fx = fixtures(d); falhas = []
    for origem, rotulo, ext, ok in CASOS:
        src = fx[origem]
        g = {r: f for _, r, f in c.gomos(src)}
        if rotulo not in g:
            falhas.append(f"{origem} → {rotulo}: gomo NÃO EXISTE (tem: {list(g)})"); continue
        try:
            outs = g[rotulo](src)
            alvo = [o for o in outs if o.suffix.lower() == "." + ext]
            if not alvo: falhas.append(f"{origem} → {rotulo}: não gerou .{ext} (gerou {[o.name for o in outs]})"); continue
            if not all(o.stat().st_size > 0 for o in alvo) or not ok(alvo[0]):
                falhas.append(f"{origem} → {rotulo}: arquivo gerado mas o CONTEÚDO não confere ({alvo[0].name})")
            else:
                print(f"  verde  {origem:6} → {rotulo}")
        except Exception as e:
            falhas.append(f"{origem} → {rotulo}: ERRO {type(e).__name__}: {e}")
    try:
        if caso_caracteres_invalidos(d): print("  verde  pdf com caracteres de controle → Excel")
        else: falhas.append("pdf com caracteres de controle → Excel: conteúdo não confere")
    except Exception as e:
        falhas.append(f"pdf com caracteres de controle → Excel: ERRO {e}")
    try:
        erros = caso_ocr_ajustes()
        if erros: falhas.append("OCR ajustes: " + " | ".join(erros[:4]))
        else: print("  verde  OCR: e-mails mal lidos e colunas grudadas")
    except Exception as e:
        falhas.append(f"OCR ajustes: ERRO {type(e).__name__}: {e}")
    try:
        erros = caso_ocr_tabela(d)
        if erros: falhas.append("imagem de tabela sem grade → Excel (OCR): " + " | ".join(erros[:3]))
        else: print("  verde  imagem de tabela sem grade → Excel (OCR, célula por célula)")
    except Exception as e:
        falhas.append(f"imagem de tabela sem grade → Excel (OCR): ERRO {type(e).__name__}: {e}")
    if falhas:
        print("\nVERMELHO —", len(falhas), "falha(s):"); [print("  ✗", f) for f in falhas]; sys.exit(1)
    print(f"\nVERDE — {len(CASOS) + 3}/{len(CASOS) + 3} conversões conferidas"); sys.exit(0)

if __name__ == "__main__":
    main()
