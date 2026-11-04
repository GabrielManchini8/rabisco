# 🍊 Rabisco

Quadro branco infinito + notas + mapa mental, **offline-first**, leve e com caneta.
Um canivete suíço para pensar: desenhe, escreva, importe arquivos, fale — tudo no mesmo quadro.

## Recursos
- **Quadro infinito** (tldraw) com zoom de 1% a 6400% e caneta com pressão (Apple Pencil, S-Pen, Wacom), palm rejection
- **PDF e imagens** como fundo para desenhar por cima; importa imagem, vídeo, áudio, texto/Markdown, código, Word
- **Mapa mental** estilo XMind: Tab/Enter, expandir/recolher, cores por ramo, estilos de conexão, ligações **vivas** (feixe de luz passivo ou ativo) ou mortas
- **Gomos** 🍊: menus radiais para formas, cores, estilos, caneta, inserir e exportar
- **Conversor local** (Shift + arrastar): imagens ↔ PNG/JPG/WEBP/PDF, remover metadados, PDF → imagens/texto, exportar seleção em PNG/SVG/PDF/Markdown
- **Voz → texto** com Whisper rodando no aparelho (sem nuvem): ditado, transcrição de áudio/vídeo, legendas SRT/VTT
- **Desenho guiado** 🎬: fale enquanto desenha; o texto entra dentro das formas, na ordem da fala, com replay sincronizado
- **Nome e observação** em qualquer figura/arquivo + **busca** (Ctrl+K)
- **Régua lateral** de organização: agrupar, frente/trás, alinhar, distribuir…
- **Sync** entre dispositivos com Yjs (CRDT) + Supabase, estilo Joplin (ao abrir, ao fechar e no botão) ou em tempo real

## Rodar
```bash
cd app
npm install
cp .env.example .env   # opcional: Supabase para sincronizar
npm run dev            # http://localhost:5173
```
Sem `.env` o app funciona 100% local (IndexedDB).

## Estrutura
```
app/            React + Vite + TypeScript (PWA)
  src/canvas    quadro, zoom
  src/mindmap   mapa mental, ligações com luz
  src/gomos     menus radiais
  src/convert   conversor de arquivos
  src/voice     Whisper (voz → texto)
  src/explain   desenho guiado
  src/search    busca
  src/sync      Yjs + Supabase
supabase/       migrações SQL (tabelas, RLS, storage)
docs/           arquitetura e roadmap
```

## Licença do tldraw
O SDK do tldraw exige licença para uso em produção (gratuita com a marca "Made with tldraw"). Veja https://tldraw.dev.
