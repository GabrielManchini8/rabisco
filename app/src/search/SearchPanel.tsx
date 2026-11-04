import { useEffect, useMemo, useState } from 'react'
import { Editor, TLShape, TLShapeId, useEditor } from 'tldraw'
import { getInfo } from '../info/ShapeInfo'

/**
 * Busca em tudo do quadro: nome, observação, textos, post-its, tópicos do mapa,
 * transcrições de áudio e nomes de arquivos. Ignora acentos e maiúsculas.
 * Abre com Ctrl/Cmd+K, "/" ou o botão 🔍.
 */
let setOpen: (v: boolean) => void = () => {}
export const openSearch = () => setOpen(true)

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const richToText = (n: any): string => n?.text ?? (n?.content ?? []).map(richToText).join(n?.type === 'doc' ? '\n' : ' ')

const TYPE_LABEL: Record<string, string> = {
  geo: 'Forma', draw: 'Desenho', highlight: 'Marca-texto', text: 'Texto', note: 'Post-it', image: 'Imagem',
  video: 'Vídeo', frame: 'Moldura', arrow: 'Seta', line: 'Linha', 'mind-node': 'Mapa mental', bookmark: 'Link', embed: 'Link',
}

function searchable(editor: Editor, s: TLShape) {
  const { name = '', obs = '' } = getInfo(s)
  const p = s.props as any
  const body = [p.richText ? richToText(p.richText) : '', p.text ?? '', p.name ?? '', p.url ?? '',
    p.assetId ? ((editor.getAsset(p.assetId) as any)?.props?.name ?? '') : ''].join(' ')
  return { name, obs, body }
}

export function search(editor: Editor, q: string) {
  const terms = norm(q).split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const out: { id: TLShapeId; title: string; snippet: string; type: string; score: number }[] = []
  for (const s of editor.getCurrentPageShapes()) {
    const f = searchable(editor, s)
    const hay = { name: norm(f.name), obs: norm(f.obs), body: norm(f.body) }
    if (!terms.every((t) => hay.name.includes(t) || hay.obs.includes(t) || hay.body.includes(t))) continue
    // nome pesa mais que observação, que pesa mais que conteúdo
    const score = terms.reduce((a, t) => a + (hay.name.includes(t) ? 3 : 0) + (hay.obs.includes(t) ? 2 : 0) + (hay.body.includes(t) ? 1 : 0), 0)
    const src = hay.obs.includes(terms[0]) ? f.obs : f.body || f.obs
    const i = Math.max(0, norm(src).indexOf(terms[0]) - 30)
    out.push({ id: s.id, type: TYPE_LABEL[s.type] ?? s.type, score,
      title: f.name || src.trim().split('\n')[0].slice(0, 60) || TYPE_LABEL[s.type] || s.type,
      snippet: (i ? '…' : '') + src.slice(i, i + 110).replace(/\s+/g, ' ') })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 50)
}

export function goTo(editor: Editor, id: TLShapeId) {
  const b = editor.getShapePageBounds(id)
  if (!b) return
  editor.select(id)
  editor.zoomToBounds(b.clone().expandBy(Math.max(b.w, b.h) * 0.6 + 40), { animation: { duration: 350 }, targetZoom: 2 })
}

function highlight(text: string, q: string) {
  const terms = norm(q).split(/\s+/).filter(Boolean)
  if (!terms.length) return text
  const n = norm(text); const marks = new Array(text.length).fill(false)
  for (const t of terms) { let i = n.indexOf(t); while (i >= 0) { for (let k = i; k < i + t.length; k++) marks[k] = true; i = n.indexOf(t, i + 1) } }
  const parts: React.ReactNode[] = []; let buf = '', on = false
  ;[...text].forEach((ch, i) => { if (marks[i] !== on) { parts.push(on ? <mark key={i}>{buf}</mark> : buf); buf = ''; on = marks[i] } buf += ch })
  parts.push(on ? <mark key="end">{buf}</mark> : buf)
  return parts
}

export function SearchPanel() {
  const editor = useEditor()
  const [open, _setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  setOpen = _setOpen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea, [contenteditable="true"]')
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing && !editor.getEditingShapeId())) {
        e.preventDefault(); e.stopPropagation(); _setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [editor])
  const results = useMemo(() => (open ? search(editor, q) : []), [open, q, editor])
  useEffect(() => setSel(0), [q])
  if (!open) return null

  const pick = (id: TLShapeId) => { goTo(editor, id); _setOpen(false) }
  return (
    <div onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) _setOpen(false) }}
      style={{ position: 'fixed', inset: 0, zIndex: 480, pointerEvents: 'all', background: 'rgba(0,0,0,.15)' }}>
      <div style={{ position: 'absolute', left: '50%', top: 60, transform: 'translateX(-50%)', width: 'min(520px, calc(100vw - 24px))',
        background: 'var(--color-panel)', color: 'var(--color-text)', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,.3)',
        fontFamily: 'system-ui', fontSize: 14, overflow: 'hidden' }}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Buscar nome, observação, texto, áudio…"
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') _setOpen(false)
            else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
            else if (e.key === 'Enter' && results[sel]) pick(results[sel].id)
          }}
          style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', border: 'none', outline: 'none', fontSize: 16, background: 'transparent', color: 'inherit' }} />
        <div style={{ maxHeight: '60vh', overflowY: 'auto', borderTop: '1px solid var(--color-muted-2)' }}>
          {q && !results.length && <div style={{ padding: 16, opacity: 0.6 }}>Nada encontrado</div>}
          {results.map((r, i) => (
            <div key={r.id} onClick={() => pick(r.id)} onMouseEnter={() => setSel(i)}
              style={{ padding: '10px 16px', cursor: 'pointer', background: i === sel ? 'var(--color-muted-1)' : 'transparent' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <b style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{highlight(r.title, q)}</b>
                <span style={{ fontSize: 11, opacity: 0.6 }}>{r.type}</span>
              </div>
              {r.snippet && r.snippet !== r.title && <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{highlight(r.snippet, q)}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function SearchButton() {
  return (
    <button title="Buscar (Ctrl+K)" onPointerDown={(e) => e.stopPropagation()} onClick={openSearch}
      style={{ position: 'fixed', left: 20, bottom: 124, width: 40, height: 40, borderRadius: 20, zIndex: 300, border: 'none',
        background: 'var(--color-panel)', boxShadow: '0 2px 8px rgba(0,0,0,.25)', cursor: 'pointer', fontSize: 18, pointerEvents: 'all' }}>🔍</button>
  )
}
