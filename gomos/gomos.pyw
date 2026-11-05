"""
Gomos — conversor de arquivos do botão direito do Windows.
Uso: gomos.pyw <arquivo> [arquivo...]  (o menu "Converter" chama isto)
Abre um anel de opções em volta do mouse; o arquivo convertido é salvo
ao lado do original e o Explorer abre com ele selecionado.
"""
from __future__ import annotations
import math, os, sys, tempfile, threading, time, subprocess
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import conversores as cv

LARANJA, LARANJA_ESCURO = "#ff922b", "#e8590c"
CHAVE = "#010203"  # cor "invisível" do fundo da janela (Windows)

# ------------------------------------------------- vários arquivos selecionados
def juntar_selecao(arquivos: list[str]) -> list[str] | None:
    """O Windows abre um processo por arquivo selecionado. O 1º junta todos; os outros saem."""
    fila = Path(tempfile.gettempdir()) / "gomos_fila"
    fila.mkdir(exist_ok=True)
    for a in arquivos:
        (fila / f"{os.getpid()}_{time.time_ns()}.txt").write_text(a, encoding="utf-8")
    trava = fila / "trava"
    try:
        fd = os.open(trava, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.close(fd)
    except FileExistsError:
        if time.time() - trava.stat().st_mtime > 10:  # trava velha de uma execução que caiu
            trava.unlink(missing_ok=True)
            return juntar_selecao([])  # tenta de novo
        return None  # outro processo vai mostrar o anel
    time.sleep(0.45)  # espera os irmãos se registrarem
    todos = []
    for f in sorted(fila.glob("*.txt")):
        try:
            todos.append(f.read_text(encoding="utf-8")); f.unlink()
        except OSError:
            pass
    trava.unlink(missing_ok=True)
    return list(dict.fromkeys(todos))

def mostrar_no_explorer(p: Path):
    if os.name == "nt":
        subprocess.Popen(["explorer", "/select,", str(p)])

# ------------------------------------------------- anel
def anel(arquivos: list[Path]):
    import tkinter as tk
    from tkinter import messagebox

    principal = arquivos[0]
    opcoes = cv.gomos(principal)
    # com vários arquivos, só mostra opções que valem para todos do mesmo tipo
    arquivos = [a for a in arquivos if cv.tipo(a) == cv.tipo(principal)]

    root = tk.Tk()
    root.overrideredirect(True)
    root.attributes("-topmost", True)
    if not opcoes:
        root.withdraw()
        messagebox.showinfo("Gomos", f"Ainda não sei converter arquivos .{principal.suffix.lstrip('.')}")
        root.destroy(); return

    n = len(opcoes)
    GW, GH = 100, 52                 # tamanho de cada gomo
    # anel oval: espaço suficiente para os gomos não se encostarem, seja qual for a quantidade
    s_ = math.sin(math.pi / max(n, 3))
    RX = max(110, (GW + 10) / (2 * s_)); RY = max(118, (GH + 10) / (2 * s_))
    W, H = int(2 * RX + GW + 20), int(2 * RY + GH + 20)
    mx, my = root.winfo_pointerxy()
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    x = min(max(mx - W // 2, 0), sw - W); y = min(max(my - H // 2, 0), sh - H)
    root.geometry(f"{W}x{H}+{x}+{y}")

    try:
        root.configure(bg=CHAVE); root.attributes("-transparentcolor", CHAVE)  # Windows: fundo invisível
        bg = CHAVE
    except tk.TclError:
        bg = "#202020"; root.attributes("-alpha", 0.96)
    c = tk.Canvas(root, width=W, height=H, bg=bg, highlightthickness=0)
    c.pack()
    cx, cy = W / 2, H / 2
    fonte = ("Segoe UI", 9); fonte_ic = ("Segoe UI Emoji", 15)

    def pilula(x0, y0, x1, y1, r, **kw):
        pts = [x0 + r, y0, x1 - r, y0, x1, y0, x1, y0 + r, x1, y1 - r, x1, y1, x1 - r, y1, x0 + r, y1, x0, y1, x0, y1 - r, x0, y0 + r, x0, y0]
        return c.create_polygon(pts, smooth=True, **kw)

    estado = {"ocupado": False}
    itens = []
    for i, (ic, rotulo, acao) in enumerate(opcoes):
        ang = i / n * 2 * math.pi - math.pi / 2
        gx, gy = cx + math.cos(ang) * RX, cy + math.sin(ang) * RY
        tag = f"g{i}"
        corpo = pilula(gx - GW / 2, gy - GH / 2, gx + GW / 2, gy + GH / 2, 18, fill="#ffffff", outline="#d0d0d0", width=1, tags=tag)
        c.create_text(gx, gy - 9, text=ic, font=fonte_ic, tags=tag)
        c.create_text(gx, gy + 13, text=rotulo, font=fonte, fill="#222", tags=tag)
        itens.append((tag, corpo, rotulo, acao))

    miolo = c.create_oval(cx - 34, cy - 34, cx + 34, cy + 34, fill=LARANJA, outline="")
    txt_miolo = c.create_text(cx, cy, text="✕", font=("Segoe UI", 18, "bold"), fill="white")
    legenda = c.create_text(cx, cy + 50, text=(principal.name if len(arquivos) == 1 else f"{len(arquivos)} arquivos"),
                            font=("Segoe UI", 9, "bold"), fill="#333")
    # fundo da legenda para ler sobre qualquer papel de parede
    bb = c.bbox(legenda); fundo_leg = pilula(bb[0] - 8, bb[1] - 3, bb[2] + 8, bb[3] + 3, 8, fill="#ffffff", outline="")
    c.tag_lower(fundo_leg, legenda)

    def fechar(*_):
        if not estado["ocupado"]:
            root.destroy()

    def hover(tag, corpo, on):
        if not estado["ocupado"]:
            c.itemconfig(corpo, fill="#fff1e3" if on else "#ffffff", outline=LARANJA if on else "#d0d0d0", width=2 if on else 1)

    def executar(rotulo, acao):
        if estado["ocupado"]:
            return
        estado["ocupado"] = True
        c.itemconfig(txt_miolo, text="⏳", font=("Segoe UI Emoji", 18))
        c.itemconfig(legenda, text=f"Convertendo → {rotulo}…")
        bb = c.bbox(legenda); c.coords(fundo_leg, *[bb[0] - 8, bb[1] - 3, bb[2] + 8, bb[1] - 3, bb[2] + 8, bb[3] + 3, bb[0] - 8, bb[3] + 3])
        for tag, *_ in itens:
            c.itemconfig(tag, state="disabled")

        def trabalho():
            gerados, erros = [], []
            for a in arquivos:
                fn = next((f for _, r, f in cv.gomos(a) if r == rotulo), None)
                if not fn:
                    continue
                try:
                    gerados += fn(a)
                except Exception as e:  # mostra o motivo em vez de travar
                    erros.append(f"{a.name}: {e}")
            root.after(0, lambda: concluir(gerados, erros))
        threading.Thread(target=trabalho, daemon=True).start()

    def concluir(gerados, erros):
        estado["ocupado"] = False
        if erros:
            root.withdraw()
            messagebox.showerror("Gomos", "Não consegui converter:\n\n" + "\n".join(erros[:8]))
        if gerados:
            c.itemconfig(miolo, fill="#2f9e44"); c.itemconfig(txt_miolo, text="✓", font=("Segoe UI", 20, "bold"))
            mostrar_no_explorer(gerados[0])
            root.after(900, root.destroy)
        else:
            root.destroy()

    for tag, corpo, rotulo, acao in itens:
        c.tag_bind(tag, "<Enter>", lambda e, t=tag, b=corpo: hover(t, b, True))
        c.tag_bind(tag, "<Leave>", lambda e, t=tag, b=corpo: hover(t, b, False))
        c.tag_bind(tag, "<Button-1>", lambda e, r=rotulo, a=acao: executar(r, a))
    c.tag_bind(miolo, "<Button-1>", fechar); c.tag_bind(txt_miolo, "<Button-1>", fechar)
    root.bind("<Escape>", fechar)
    root.bind("<FocusOut>", lambda e: root.after(150, lambda: (not estado["ocupado"]) and root.focus_get() is None and fechar()))
    root.after(50, root.focus_force)
    root.mainloop()

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a]
    if not args:
        print(__doc__); sys.exit(0)
    sel = juntar_selecao(args) if os.name == "nt" else args
    if sel:
        anel([Path(a) for a in sel if Path(a).exists()])
