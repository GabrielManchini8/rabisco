# Rabisco — Arquitetura e próximos passos

## Decisões
| Tema | Escolha | Por quê |
|---|---|---|
| UI | **React + Vite** | tldraw é React; Lexical/Tiptap têm bindings React maduros |
| Canvas | **tldraw 3.x** | caneta com pressão, palm rejection (`isPenMode`), imagens, setas com binding, shapes customizados |
| Mapa mental | shape `mind-node` próprio + setas tldraw | expandir/recolher, cores por ramo, estilos de conexão |
| Texto | **Lexical** (recomendado) | mais leve que Tiptap/ProseMirror, tem `@lexical/yjs` |
| Dados | **Yjs** (fonte da verdade) + `y-indexeddb`; **Dexie** só p/ metadados/busca/backlinks | carregar a sidebar sem abrir todos os canvases |
| Nuvem | Supabase: log append-only de updates Yjs + snapshots + Storage | sync leve, sem conflitos |
| Empacote | Tauri 2 (desktop **e** mobile possível) / Capacitor / PWA | |

> ⚠️ Licença tldraw: uso em produção exige license key (gratuita p/ hobby/não comercial com marca d'água; paga sem). Alternativa 100% livre: Excalidraw (menos extensível) ou React Flow + canvas próprio de desenho.

## Formato de grafo (export/import)
O estado vive como records do tldraw no Y.Doc. O JSON `{nodes, edges}` do briefing é uma **projeção**:
`mind-node` → `nodes`, setas com `meta.mindEdge` → `edges`. Implementar `exportGraph(editor)` / `importGraph()` para interoperabilidade e busca.

## Roadmap
1. ✅ Canvas + caneta + PDF/imagem por baixo + mapa mental + sync Yjs/IndexedDB/Supabase (este commit)
2. Notas Markdown com Lexical + `[[wikilinks]]` + backlinks (Dexie `links`)
3. Nó "nota" no canvas que embute uma nota (Obsidian Canvas)
4. Auth Supabase (magic link) + `documents` + compactação de `doc_updates` em `doc_snapshots` (Edge Function)
5. PDFs/imagens no Supabase Storage (hoje dataURL no doc → pesa no sync); render lazy de páginas
6. Auto-layout do mapa (balanceado esquerda/direita, como XMind), temas, ícones/emoji, notas por tópico
7. Empacotar: `npm create tauri-app` apontando p/ `app/dist`; `npx cap add android ios`
8. Performance: virtualização já vem do tldraw (culling); medir em Android baixo (Chrome DevTools remote)
