"""
PORTÃO (gate) das conversões cruzadas PDF ⇄ Word ⇄ Excel ⇄ Imagem.
Não confia em "deu certo": abre cada arquivo gerado e confere o CONTEÚDO.
Saída 0 = verde (tudo passou). Saída 1 = vermelho (lista o que falhou).
Uso: python testes/portao.py
"""
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
    wb.save(d / "planilha.xlsx")
    # Word com tabela
    doc = docx.Document(); doc.add_heading("Relatório", 1); doc.add_paragraph("Itens em estoque:")
    t = doc.add_table(rows=3, cols=3); t.style = "Table Grid"
    for i, r in enumerate(LINHAS):
        for j, v in enumerate(r): t.cell(i, j).text = str(v)
    doc.save(d / "documento.docx")
    # PDF com tabela de verdade (gerado a partir de HTML)
    html = "<h1>Relatório</h1><table border=1>" + "".join("<tr>" + "".join(f"<td>{v}</td>" for v in r) + "</tr>" for r in LINHAS) + "</table>"
    story = pymupdf.Story(html=html, user_css="table{border-collapse:collapse} td{border:1px solid black;padding:4px}")
    w = pymupdf.DocumentWriter(str(d / "tabela.pdf")); a4 = pymupdf.paper_rect("a4")
    dev = w.begin_page(a4); story.place(a4 + (50, 50, -50, -50)); story.draw(dev); w.end_page(); w.close()
    # Imagem
    im = Image.new("RGB", (400, 240), "#ff922b"); ImageDraw.Draw(im).rectangle((40, 40, 360, 200), outline="white", width=8)
    im.save(d / "foto.png")
    return {"pdf": d / "tabela.pdf", "word": d / "documento.docx", "excel": d / "planilha.xlsx", "imagem": d / "foto.png"}

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

def caso_caracteres_invalidos(d: Path):
    """Regressão: PDFs em árabe trazem caracteres de controle que o Excel recusa."""
    import pymupdf
    doc = pymupdf.open(); pg = doc.new_page()
    pg.insert_text((72, 72), "Item\x0b com \x01controle", fontsize=12); pg.insert_text((72, 100), MARCA, fontsize=12)
    src = d / "controle.pdf"; doc.save(src)
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
    if falhas:
        print("\nVERMELHO —", len(falhas), "falha(s):"); [print("  ✗", f) for f in falhas]; sys.exit(1)
    print(f"\nVERDE — {len(CASOS) + 1}/{len(CASOS) + 1} conversões conferidas"); sys.exit(0)

if __name__ == "__main__":
    main()
