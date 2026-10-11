/**
 * API Route: /api/demo-remove-bg
 *
 * Menjalankan inferensi model BiRefNet riil untuk foto contoh (background-removal-before.png).
 * Memanggil HuggingFace ZeroGPU Gradio Space (ilhamdev-rembg) secara langsung.
 */

import { DEMO_BEFORE_IMAGE } from '@/lib/demo-data'
import { checkRateLimit } from '@/lib/rate-limit'

const HF_SPACE_URL = (process.env.NEXT_PUBLIC_HF_SPACE_URL || 'https://ilhamdev-rembg.hf.space').replace(/\/+$/, '')
const TIMEOUT_MS = 90_000

export async function POST(request) {
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('cf-connecting-ip') || '127.0.0.1'
    const rateLimit = checkRateLimit(`demo-${clientIp}`, 10, 60_000)
    if (!rateLimit.allowed) {
      return Response.json(
        { error: 'Terlalu banyak permintaan demo. Harap tunggu sesaat sebelum mencoba lagi.' },
        {
          status: 429,
          headers: { 'Retry-After': Math.ceil(rateLimit.resetMs / 1000).toString() },
        }
      )
    }

    let modelName = 'birefnet-portrait'
    let alphaMatting = false

    try {
      const body = await request.json()
      if (body.model_name) modelName = body.model_name
      if (typeof body.alpha_matting === 'boolean') alphaMatting = body.alpha_matting
    } catch {
      // Default jika tidak ada body json
    }

    // ── STEP 1: Gunakan data URL foto referensi yang ter-embed ───────────────
    const dataUrl = DEMO_BEFORE_IMAGE

    const payload = {
      data: [dataUrl, modelName, alphaMatting],
    }

    // ── STEP 2: Panggil HuggingFace Gradio Space ────────────────────────────
    const endpoint = `${HF_SPACE_URL}/gradio_api/call/remove_bg`
    console.log('[Demo API] Menghubungi endpoint model riil:', endpoint, 'Model:', modelName)

    const callRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!callRes.ok) {
      const errText = await callRes.text()
      console.error('[Demo API] Call failed:', callRes.status, errText.slice(0, 100))
      return Response.json(
        { error: `Gagal memanggil model ZeroGPU: status ${callRes.status}` },
        { status: 502 }
      )
    }

    const { event_id } = await callRes.json()
    if (!event_id) {
      return Response.json({ error: 'Tidak ada event_id dari HuggingFace' }, { status: 502 })
    }

    // ── STEP 3: Baca SSE Stream sampai complete ────────────────────────────
    const sseUrl = `${endpoint}/${event_id}`
    const sseController = new AbortController()
    const sseTimer = setTimeout(() => sseController.abort(), TIMEOUT_MS)

    let sseRes
    try {
      sseRes = await fetch(sseUrl, {
        headers: { Accept: 'text/event-stream' },
        signal: sseController.signal,
      })
    } finally {
      clearTimeout(sseTimer)
    }

    if (!sseRes.ok) {
      return Response.json(
        { error: `Gagal membaca SSE status: ${sseRes.status}` },
        { status: 502 }
      )
    }

    const sseText = await sseRes.text()
    const lines = sseText.split('\n')
    let currentEvent = ''
    let resultOutput = null
    let errorMsg = null

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('event: ')) {
        currentEvent = trimmed.slice(7).trim()
      } else if (trimmed.startsWith('data: ')) {
        const raw = trimmed.slice(6).trim()
        if (currentEvent === 'error') {
          errorMsg = raw
          break
        }
        if (currentEvent === 'complete') {
          try {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed) && parsed.length > 0) {
              resultOutput = parsed[0]
            }
          } catch {
            console.error('[Demo SSE parse error]', raw.slice(0, 100))
          }
        }
      }
    }

    if (errorMsg) {
      return Response.json({ error: `Gradio inference error: ${errorMsg}` }, { status: 502 })
    }

    if (!resultOutput) {
      return Response.json(
        { error: 'ZeroGPU belum selesai atau sedang antre. Silakan coba kembali.' },
        { status: 502 }
      )
    }

    // ── STEP 4: Format hasil ────────────────────────────────────────────────
    if (typeof resultOutput === 'string') {
      const finalImage = resultOutput.startsWith('data:')
        ? resultOutput
        : `data:image/png;base64,${resultOutput}`

      return Response.json({
        success: true,
        image: finalImage,
        model: modelName,
        source: 'real-zerogpu-inference',
      })
    }

    return Response.json({ error: 'Format output dari HuggingFace tidak dikenali' }, { status: 502 })
  } catch (err) {
    console.error('[Demo API Error]', err)
    return Response.json({ error: err.message || 'Terjadi kesalahan pada server' }, { status: 500 })
  }
}
