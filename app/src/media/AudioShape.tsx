import { useEffect, useState } from 'react'
import { BaseBoxShapeUtil, Editor, HTMLContainer, RecordProps, T, TLBaseShape, VecLike, createShapeId, stopEventPropagation } from 'tldraw'
import { db } from '../db/local'

/** Cartão de áudio no quadro: toca mp3/wav/m4a/ogg… (o arquivo fica no aparelho, em IndexedDB) */
export type AudioCardShape = TLBaseShape<'audio-card', { w: number; h: number; name: string; mediaId: string }>

export class AudioCardUtil extends BaseBoxShapeUtil<AudioCardShape> {
  static override type = 'audio-card' as const
  static override props: RecordProps<AudioCardShape> = { w: T.number, h: T.number, name: T.string, mediaId: T.string }
  getDefaultProps(): AudioCardShape['props'] { return { w: 320, h: 96, name: 'Áudio', mediaId: '' } }
  component(s: AudioCardShape) { return <AudioCard shape={s} /> }
  indicator(s: AudioCardShape) { return <rect width={s.props.w} height={s.props.h} rx={14} /> }
}

function AudioCard({ shape }: { shape: AudioCardShape }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let u: string | null = null
    db.media.get(shape.props.mediaId).then((m) => { if (m) { u = URL.createObjectURL(m.blob); setUrl(u) } })
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [shape.props.mediaId])
  return (
    <HTMLContainer style={{ pointerEvents: 'all' }}>
      <div style={{ width: shape.props.w, height: shape.props.h, boxSizing: 'border-box', borderRadius: 14, padding: 12,
        background: 'var(--color-panel)', border: '2px solid #ff922b', display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'system-ui' }}>
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--color-text)' }}>🎵 {shape.props.name}</div>
        {url ? <audio src={url} controls style={{ width: '100%' }} onPointerDown={stopEventPropagation} />
             : <div style={{ fontSize: 12, opacity: 0.6 }}>Áudio não está neste aparelho</div>}
      </div>
    </HTMLContainer>
  )
}

export async function addAudioCard(editor: Editor, file: File, at: VecLike) {
  const mediaId = crypto.randomUUID()
  await db.media.put({ id: mediaId, blob: file, createdAt: Date.now() })
  const id = createShapeId()
  editor.createShape<AudioCardShape>({ id, type: 'audio-card', x: at.x, y: at.y, props: { name: file.name, mediaId, w: 320, h: 96 }, meta: { name: file.name } })
  editor.select(id)
}
export const getAudioBlob = async (s: AudioCardShape) => (await db.media.get(s.props.mediaId))?.blob
