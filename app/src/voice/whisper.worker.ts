/// <reference lib="webworker" />
import { pipeline, env } from '@huggingface/transformers'
// motor ONNX empacotado junto com o app (não vem do CDN) → funciona offline e no Tauri/Capacitor
import ortWasm from '../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm?url'
import ortMjs from '../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs?url'

/**
 * Whisper rodando 100% no aparelho (mesma ideia do Buzz, mas no navegador/app).
 * O modelo é baixado UMA vez e fica no cache → depois funciona offline.
 * WebGPU quando disponível (rápido); senão WASM (funciona em qualquer lugar).
 */
env.allowLocalModels = false
env.backends.onnx.wasm!.wasmPaths = { wasm: ortWasm, mjs: ortMjs } as any
let asr: any = null
let loadedModel = ''

self.onmessage = async (e: MessageEvent) => {
  const { audio, model, language, words } = e.data as { audio: Float32Array; model: string; language: string | null; words?: boolean }
  try {
    if (!asr || loadedModel !== model) {
      const device = (await (navigator as any).gpu?.requestAdapter?.()) ? 'webgpu' : 'wasm'
      asr = await pipeline('automatic-speech-recognition', model, {
        device, dtype: device === 'webgpu' ? 'fp32' : 'q8',
        progress_callback: (p: any) => p.status === 'progress' && self.postMessage({ type: 'download', file: p.file, progress: p.progress }),
      })
      loadedModel = model
    }
    self.postMessage({ type: 'status', text: 'Transcrevendo…' })
    const out = await asr(audio, {
      language, task: 'transcribe', return_timestamps: words ? 'word' : true, chunk_length_s: 30, stride_length_s: 5,
    })
    self.postMessage({ type: 'done', text: out.text.trim(), chunks: out.chunks ?? [] })
  } catch (err) {
    self.postMessage({ type: 'error', text: String((err as Error)?.message ?? err) })
  }
}
