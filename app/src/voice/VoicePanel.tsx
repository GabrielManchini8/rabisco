import { useEffect, useRef, useState } from 'react'
import { Editor, createShapeId, toRichText, useEditor } from 'tldraw'
import { LANGS, LangKey, getLang, MODELS, ModelKey, getModel, startRecording, toSrt, toTimedText, toVtt, transcribe } from './transcribe'
import { download } from '../convert/converters'

/** Painel de ditado / transcrição (abre pelos gomos ou pelo conversor) */
type Job = { mode: 'record' } | { mode: 'file'; file: File; at?: { x: number; y: number } }
let openPanel: (j: Job | null) => void = () => {}
export const openVoice = (j: Job) => openPanel(j)

export function addTranscriptNote(editor: Editor, title: string, text: string, at: { x: number; y: number } = editor.getViewportPageBounds().center) {
  const id = createShapeId()
  editor.createShape({ id, type: 'text', x: at.x - 260, y: at.y - 40,
    props: { richText: toRichText(`🎙 ${title}\n\n${text}`), autoSize: false, w: 520, size: 's', font: 'sans', textAlign: 'start' } })
  editor.select(id)
}

export function VoicePanel() {
  const editor = useEditor()
  const [job, setJob] = useState<Job | null>(null)
  const [status, setStatus] = useState('')
  const [secs, setSecs] = useState(0)
  const [result, setResult] = useState<{ text: string; chunks: any[]; name: string } | null>(null)
  const [model, setModel] = useState<ModelKey>(getModel())
  const [lang, setLang] = useState<LangKey>(getLang())
  const rec = useRef<Awaited<ReturnType<typeof startRecording>> | null>(null)
  openPanel = (j) => { setJob(j); setResult(null); setStatus(''); setSecs(0) }

  const run = async (blob: Blob, name: string, at?: { x: number; y: number }) => {
    try {
      const r = await transcribe(blob, setStatus)
      setStatus('')
      if (job?.mode === 'record' || at) { addTranscriptNote(editor, name, r.text, at); setJob(null) }
      else setResult({ ...r, name })
    } catch (e) { setStatus('Erro: ' + (e as Error).message) }
  }

  useEffect(() => {
    if (!job) return
    if (job.mode === 'file') { run(job.file, job.file.name, job.at); return }
    let t: ReturnType<typeof setInterval>
    startRecording().then((r) => { rec.current = r; setStatus('Gravando…'); t = setInterval(() => setSecs((s) => s + 1), 1000) })
      .catch(() => setStatus('Sem acesso ao microfone'))
    return () => clearInterval(t)
  }, [job])

  if (!job) return null
  const recording = job.mode === 'record' && status === 'Gravando…'
  const btn: React.CSSProperties = { border: 'none', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', background: 'var(--color-muted-1)', color: 'var(--color-text)' }
  return (
    <div onPointerDown={(e) => e.stopPropagation()} style={{
      position: 'fixed', left: '50%', top: 70, transform: 'translateX(-50%)', zIndex: 450, pointerEvents: 'all',
      width: 'min(420px, calc(100vw - 32px))', background: 'var(--color-panel)', color: 'var(--color-text)',
      borderRadius: 16, padding: 16, boxShadow: '0 8px 30px rgba(0,0,0,.25)', fontFamily: 'system-ui', fontSize: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <b>🎙 Voz → texto</b>
        <button style={{ ...btn, background: 'transparent' }} onClick={() => { rec.current?.stop(); setJob(null) }}>✕</button>
      </div>

      {recording && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 12, height: 12, borderRadius: 6, background: '#e03131', animation: 'rabisco-blink 1s infinite' }} />
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
          <button style={{ ...btn, marginLeft: 'auto', background: '#ff922b', color: '#fff' }}
            onClick={async () => { const b = await rec.current!.stop(); rec.current = null; run(b, `Ditado ${new Date().toLocaleString()}`) }}>
            ■ Parar e transcrever
          </button>
          <style>{'@keyframes rabisco-blink{50%{opacity:.2}}'}</style>
        </div>
      )}
      {!recording && status && <div>{status}</div>}

      {result && (
        <>
          <textarea readOnly value={result.text} style={{ width: '100%', height: 140, boxSizing: 'border-box', marginTop: 6 }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            <button style={btn} onClick={() => { addTranscriptNote(editor, result.name, result.text); setJob(null) }}>🗒 Nota no quadro</button>
            <button style={btn} onClick={() => addTranscriptNote(editor, result.name, toTimedText(result.chunks))}>⏱ Nota com tempos</button>
            <button style={btn} onClick={() => download(new Blob([result.text], { type: 'text/plain' }), result.name + '.txt')}>TXT</button>
            <button style={btn} onClick={() => download(new Blob([toSrt(result.chunks)], { type: 'text/plain' }), result.name + '.srt')}>SRT</button>
            <button style={btn} onClick={() => download(new Blob([toVtt(result.chunks)], { type: 'text/vtt' }), result.name + '.vtt')}>VTT</button>
            <button style={btn} onClick={() => navigator.clipboard.writeText(result.text)}>📋 Copiar</button>
          </div>
        </>
      )}

      <label style={{ display: 'block', marginTop: 12, fontSize: 12, opacity: 0.75 }}>
        Qualidade: <select value={model} onChange={(e) => { const k = e.target.value as ModelKey; setModel(k); try { localStorage.setItem('rabisco:whisper', k) } catch {} }}>
          {Object.keys(MODELS).map((k) => <option key={k} value={k}>{k}</option>)}
        </select> · Idioma: <select value={lang} onChange={(e) => { const k = e.target.value as LangKey; setLang(k); try { localStorage.setItem('rabisco:lang', k) } catch {} }}>
          {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select><br />Roda no aparelho, nada vai para a nuvem
      </label>
    </div>
  )
}
