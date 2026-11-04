import * as Y from 'yjs'
import { atom } from 'tldraw'
import { supabase } from '../db/supabase'

/**
 * Sincronização entre dispositivos (CRDT Yjs → nunca há conflito, só mescla).
 *
 * Modos:
 *  - 'joplin' (padrão): sincroniza em 3 momentos — ① ao abrir o app,
 *    ② ao tocar em "Sincronizar", ③ ao fechar / ir para segundo plano.
 *    Zero tráfego no meio do uso → economiza bateria e dados no celular.
 *  - 'auto': além dos 3 momentos, envia alterações a cada poucos segundos e
 *    recebe as dos outros aparelhos em tempo real.
 *
 * Tudo que é editado offline fica numa fila local (persistida) e sobe na próxima sincronização.
 */
export type SyncMode = 'joplin' | 'auto'
export type SyncState = { status: 'off' | 'idle' | 'syncing' | 'error' | 'offline'; last?: number; pending: number; mode: SyncMode; error?: string }

const MODE_KEY = 'rabisco:syncMode'
const readMode = (): SyncMode => { try { return (localStorage.getItem(MODE_KEY) as SyncMode) || 'joplin' } catch { return 'joplin' } }
export const syncState = atom<SyncState>('sync', { status: supabase ? 'idle' : 'off', pending: 0, mode: readMode() })

type Ctl = { syncNow: () => Promise<void>; setMode: (m: SyncMode) => void }
let current: Ctl | null = null
export const syncNow = () => current?.syncNow()
export const setSyncMode = (m: SyncMode) => { try { localStorage.setItem(MODE_KEY, m) } catch {}; current?.setMode(m) ?? syncState.update((s) => ({ ...s, mode: m })) }

export function startCloudSync(documentId: string, doc: Y.Doc) {
  if (!supabase) return () => {}
  const sb = supabase
  const REMOTE = Symbol('remote')
  const cursorKey = `rabisco:cursor:${documentId}`
  const queueKey = `rabisco:queue:${documentId}`
  let mode = readMode()
  let timer: ReturnType<typeof setTimeout> | undefined
  let channel: ReturnType<typeof sb.channel> | null = null
  let running: Promise<void> | null = null

  // fila de alterações locais ainda não enviadas (sobrevive a fechar o app)
  let pending: Uint8Array[] = loadQueue()
  function loadQueue(): Uint8Array[] { try { const q = localStorage.getItem(queueKey); return q ? [fromB64(q)] : [] } catch { return [] } }
  function saveQueue() {
    try { pending.length ? localStorage.setItem(queueKey, toB64(Y.mergeUpdates(pending))) : localStorage.removeItem(queueKey) } catch {}
    syncState.update((s) => ({ ...s, pending: pending.length ? 1 : 0 }))
  }
  saveQueue()

  const set = (p: Partial<SyncState>) => syncState.update((s) => ({ ...s, ...p }))

  async function push() {
    if (!pending.length) return
    const merged = Y.mergeUpdates(pending)
    const sent = pending.length
    const { error } = await sb.from('doc_updates').insert({ document_id: documentId, update: toB64(merged) })
    if (error) throw error
    pending = pending.slice(sent) // mantém o que chegou durante o envio
    saveQueue()
  }
  async function pull() {
    const since = Number(localStorage.getItem(cursorKey) ?? 0)
    const { data, error } = await sb.from('doc_updates').select('id, update').eq('document_id', documentId).gt('id', since).order('id')
    if (error) throw error
    if (data?.length) {
      Y.transact(doc, () => data.forEach((row) => Y.applyUpdate(doc, fromB64(row.update), REMOTE)), REMOTE)
      localStorage.setItem(cursorKey, String(data.at(-1)!.id))
    }
    // 1ª vez neste aparelho: garante que o servidor recebe tudo que só existe aqui
    if (since === 0 && !data?.length) { pending.push(Y.encodeStateAsUpdate(doc)); saveQueue() }
  }

  async function syncNow() {
    if (running) return running
    if (!navigator.onLine) { set({ status: 'offline' }); return }
    set({ status: 'syncing', error: undefined })
    running = (async () => {
      try { await pull(); await push(); set({ status: 'idle', last: Date.now() }) }
      catch (e) { set({ status: 'error', error: (e as Error).message }) }
      finally { running = null }
    })()
    return running
  }

  // alterações locais → fila; no modo auto, envia em lote após 2 s parado
  const onUpdate = (u: Uint8Array, origin: unknown) => {
    if (origin === REMOTE) return
    pending.push(u); saveQueue()
    if (mode === 'auto') { clearTimeout(timer); timer = setTimeout(syncNow, 2000) }
  }
  doc.on('update', onUpdate)

  function setMode(m: SyncMode) {
    mode = m; set({ mode: m })
    if (m === 'auto' && !channel) {
      channel = sb.channel(`doc:${documentId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'doc_updates', filter: `document_id=eq.${documentId}` },
          (p) => Y.applyUpdate(doc, fromB64((p.new as any).update), REMOTE))
        .subscribe()
    } else if (m === 'joplin' && channel) { sb.removeChannel(channel); channel = null }
  }
  setMode(mode)

  // ① ao abrir
  syncNow()
  // ③ ao fechar / minimizar / trocar de app (no celular "fechar" = ir para segundo plano)
  const onHide = () => { if (document.visibilityState === 'hidden') syncNow() }
  const onPageHide = () => syncNow()
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', onPageHide)
  // ao voltar a internet, no modo auto, envia o que estava na fila
  const onOnline = () => { if (mode === 'auto' || pending.length) syncNow() }
  window.addEventListener('online', onOnline)
  // ao voltar ao app (celular), puxa o que mudou nos outros aparelhos
  const onShow = () => { if (document.visibilityState === 'visible') syncNow() }
  document.addEventListener('visibilitychange', onShow)

  current = { syncNow, setMode }
  return () => {
    doc.off('update', onUpdate); clearTimeout(timer); syncNow()
    if (channel) sb.removeChannel(channel)
    document.removeEventListener('visibilitychange', onHide)
    document.removeEventListener('visibilitychange', onShow)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('online', onOnline)
    current = null
  }
}

/** Para o Tauri/Capacitor: chame antes de fechar a janela e espere terminar. */
export async function syncBeforeClose(timeoutMs = 5000) {
  await Promise.race([syncNow(), new Promise((r) => setTimeout(r, timeoutMs))])
}

// base64 em blocos (String.fromCharCode(...u) estoura a pilha com documentos grandes)
function toB64(u: Uint8Array) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) }
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
