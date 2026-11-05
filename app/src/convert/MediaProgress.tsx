import { useValue } from 'tldraw'
import { mediaJob } from './media'

/** Barra de progresso das conversões (ffmpeg/HEIC) */
export function MediaProgress() {
  const job = useValue(mediaJob)
  if (!job) return null
  return (
    <div style={{ position: 'fixed', left: '50%', bottom: 110, transform: 'translateX(-50%)', zIndex: 460, pointerEvents: 'none',
      background: 'var(--color-panel)', color: 'var(--color-text)', borderRadius: 12, padding: '10px 14px', minWidth: 260,
      boxShadow: '0 4px 18px rgba(0,0,0,.25)', fontFamily: 'system-ui', fontSize: 13 }}>
      <div>⏳ {job.label}</div>
      <div style={{ height: 6, marginTop: 8, borderRadius: 3, background: 'var(--color-muted-2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.round(job.progress * 100)}%`, background: '#ff922b', transition: 'width .2s' }} />
      </div>
    </div>
  )
}
