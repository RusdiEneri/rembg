/**
 * API Route: /api/demo-remove-bg
 *
 * Menjalankan inferensi model BiRefNet riil untuk foto contoh (background-removal-before.png).
 * Memanggil HuggingFace ZeroGPU Gradio Space (ilhamdev-rembg) secara langsung.
 */

import { DEMO_BEFORE_IMAGE, DEMO_AFTER_IMAGE } from '@/lib/demo-data'
import { checkRateLimit } from '@/lib/rate-limit'
import { executeGradioInference, resolveForwardedIp } from '@/lib/hf-inference'

const HF_SPACE_URL = (process.env.NEXT_PUBLIC_HF_SPACE_URL || 'https://ilhamdev-rembg.hf.space').replace(/\/+$/, '')
const TIMEOUT_MS = 90_000

export async function POST(request) {
  try {
    const forwardedIp = resolveForwardedIp(request)
    const rateLimit = checkRateLimit(`demo-${forwardedIp}`, 10, 60_000)
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

    // ── STEP 2: Panggil Hugging Face dengan Token & Fallback ──────────────────
    try {
      const { result, endpointUsed, isGpu } = await executeGradioInference({
        spaceUrl: HF_SPACE_URL,
        dataPayload: [dataUrl, modelName, alphaMatting],
        clientIp: forwardedIp,
        timeoutMs: TIMEOUT_MS,
      })

      if (result) {
        let finalImage = ''
        if (typeof result === 'string') {
          finalImage = result.startsWith('data:') ? result : `data:image/png;base64,${result}`
        } else if (result.url || result.path) {
          let imgUrl = result.url || result.path
          if (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:')) {
            imgUrl = `${HF_SPACE_URL}/gradio_api/file=${imgUrl}`
          }
          const fileRes = await fetch(imgUrl)
          if (fileRes.ok) {
            const buf = await fileRes.arrayBuffer()
            const mime = fileRes.headers.get('content-type') || 'image/png'
            finalImage = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`
          }
        }

        if (finalImage) {
          return Response.json({
            success: true,
            image: finalImage,
            model: modelName,
            engine: endpointUsed,
            isGpu,
            source: 'real-zerogpu-inference',
          })
        }
      }
    } catch (inferErr) {
      console.warn('[Demo API] External inference exception, falling back to embedded sample:', inferErr.message)
      // Fallback ke data URL gambar sampel valid yang terverifikasi
      return Response.json({
        success: true,
        image: DEMO_AFTER_IMAGE,
        model: modelName,
        source: 'cached-demo-sample',
        notice: inferErr.message,
      })
    }

    return Response.json({
      success: true,
      image: DEMO_AFTER_IMAGE,
      model: modelName,
      source: 'cached-demo-sample',
    })
  } catch (err) {
    console.error('[Demo API Error]', err)
    return Response.json({ error: err.message || 'Terjadi kesalahan pada server' }, { status: 500 })
  }
}
