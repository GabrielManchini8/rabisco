import { useState } from 'react'
import { useValue } from 'tldraw'
import { setSyncMode, syncNow, syncState } from './supabaseSync'

const ago = (t?: number) => {
  if (!t) return 'nunca'
  const s = Math.round((Date.now() - t) / 1000)
  return s < 60 ? 'agora' : s < 3600 ? `há ${Math.round(s / 60)} min` : new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/** Botão ⟳ no topo, estilo Joplin: mostra estado, último sync e o modo. */
export function SyncButton() {
  const st = useValue(syncState)
  const [menu, setMenu] = useState(false)
  const icon = { off: '☁︎', idle: st.pending ? '⟳•' : '✓', syncing: '⟳', error: '⚠', offline: '⌀' }[st.status]
  const title = st.status === 'off' ? 'Nuvem não configurada (só neste aparelho)'
    : st.status === 'error' ? `Erro: ${st.error}` : st.status === 'offline' ? 'Sem internet — alterações guardadas na fila'
    : `Sincronizado ${ago(st.last)}${st.pending ? ' · há alterações para enviar' : ''}`
  const b: React.CSSProperties = { border: 'none', background: 'transparent', color: 'var(--color-text)', cursor: 'pointer', padding: '6px 10px', fontSize: 13, textAlign: 'left' }
  return (
    <div onPointerDown={(e) => e.stopPropagation()} style={{ position: 'fixed', top: 52, right: 12, zIndex: 320, pointerEvents: 'all', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', borderRadius: 999, background: 'var(--color-panel)', boxShadow: '0 2px 8px rgba(0,0,0,.2)' }}>
        <button style={{ ...b, fontSize: 14 }} title={title} disabled={st.status === 'off'} onClick={() => syncNow()}>
          <span style={{ display: 'inline-block', animation: st.status === 'syncing' ? 'rabisco-spin 1s linear infinite' : 'none' }}>{icon}</span>
          {' '}{st.status === 'off' ? 'Local' : 'Sincronizar'}
        </button>
        <button style={b} onClick={() => setMenu(!menu)} title="Opções de sincronização">▾</button>
      </div>
      {menu && (
        <div style={{ marginTop: 6, padding: 6, borderRadius: 12, background: 'var(--color-panel)', boxShadow: '0 4px 16px rgba(0,0,0,.2)', display: 'grid', width: 250 }}>
          <div style={{ fontSize: 12, opacity: 0.7, padding: '4px 10px' }}>{title}</div>
          <button style={{ ...b, fontWeight: st.mode === 'joplin' ? 700 : 400 }} onClick={() => { setSyncMode('joplin'); setMenu(false) }}>
            {st.mode === 'joplin' ? '● ' : '○ '}Ao abrir, ao fechar e no botão
          </button>
          <button style={{ ...b, fontWeight: st.mode === 'auto' ? 700 : 400 }} onClick={() => { setSyncMode('auto'); setMenu(false) }}>
            {st.mode === 'auto' ? '● ' : '○ '}Automático (tempo real)
          </button>
        </div>
      )}
      <style>{'@keyframes rabisco-spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  )
}
