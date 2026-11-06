"""Roda TODOS os gomos em todos os arquivos de uma pasta e mostra o que falhou.
Uso:  python testes/testar_pasta.py C:\\caminho\\da\\pasta [senha_dos_pdfs]
Usado com os acervos de teste github.com/py-pdf/sample-files e felixlimanta/sample-docx-repo."""
import sys, logging
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import conversores as c
logging.disable(logging.CRITICAL)
pasta = Path(sys.argv[1]); c.PEDIR_SENHA = (lambda n: sys.argv[2]) if len(sys.argv) > 2 else None
ok, falhas = 0, []
for f in sorted(p for p in pasta.rglob("*") if p.is_file() and " - " not in p.stem and "(" not in p.stem):
    for _, rotulo, fn in c.gomos(f):
        try:
            fn(f); ok += 1
        except Exception as e:
            falhas.append(f"{f.name} → {rotulo}: {e}")
print(f"OK: {ok}   Falhas: {len(falhas)}"); print("\n".join(falhas)); print("\nAvisos:\n" + "\n".join(c.AVISOS))
