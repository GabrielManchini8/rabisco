import { useEffect, useMemo, useState } from 'react'
import { TLAnyShapeUtilConstructor, TLRecord, TLStoreWithStatus, createTLStore, defaultShapeUtils } from 'tldraw'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { startCloudSync } from './supabaseSync'

/**
 * Fonte da verdade = Y.Doc. Cada record do tldraw (shape, asset, page...)
 * vira uma entrada em Y.Map<TLRecord>. Isso dá:
 *  - offline instantâneo (y-indexeddb carrega o doc local antes de tudo)
 *  - merge sem conflitos entre dispositivos (CRDT)
 *  - sync leve: só deltas binários vão para a nuvem
 */
export function useYjsStore(documentId: string, customShapeUtils: TLAnyShapeUtilConstructor[] = []): TLStoreWithStatus {
  const [status, setStatus] = useState<TLStoreWithStatus>({ status: 'loading' })
  const { doc, yRecords, store } = useMemo(() => {
    const doc = new Y.Doc()
    return { doc, yRecords: doc.getMap<TLRecord>('tl_records'), store: createTLStore({ shapeUtils: [...defaultShapeUtils, ...customShapeUtils] }) }
  }, [documentId])

  useEffect(() => {
    const local = new IndexeddbPersistence(`doc:${documentId}`, doc)
    const unsubs: Array<() => void> = []
    const LOCAL = Symbol('tldraw')

    local.whenSynced.then(() => {
      // 1) Y.Doc -> store
      store.mergeRemoteChanges(() => {
        store.put([...yRecords.values()])
      })
      // 2) store -> Y.Doc (só mudanças do usuário, não "session"/câmera)
      unsubs.push(store.listen(({ changes }) => {
        doc.transact(() => {
          Object.values(changes.added).forEach((r) => yRecords.set(r.id, r))
          Object.values(changes.updated).forEach(([, r]) => yRecords.set(r.id, r))
          Object.values(changes.removed).forEach((r) => yRecords.delete(r.id))
        }, LOCAL)
      }, { source: 'user', scope: 'document' }))
      // 3) mudanças remotas (outro dispositivo) -> store
      const onY = (e: Y.YMapEvent<TLRecord>, tr: Y.Transaction) => {
        if (tr.origin === LOCAL) return
        const put: TLRecord[] = []; const del: TLRecord['id'][] = []
        e.changes.keys.forEach((c, id) => {
          if (c.action === 'delete') del.push(id as TLRecord['id'])
          else put.push(yRecords.get(id)!)
        })
        store.mergeRemoteChanges(() => { if (del.length) store.remove(del); if (put.length) store.put(put) })
      }
      yRecords.observe(onY)
      unsubs.push(() => yRecords.unobserve(onY))
      unsubs.push(startCloudSync(documentId, doc))
      setStatus({ status: 'synced-local', store })
    })

    return () => { unsubs.forEach((u) => u()); local.destroy(); doc.destroy() }
  }, [documentId, doc, yRecords, store])

  return status
}
