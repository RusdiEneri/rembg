/**
 * API Route: /api/remove-bg
 *
 * Mengirim gambar langsung sebagai base64 ke HuggingFace Gradio Space (ZeroGPU).
 * Tidak memerlukan endpoint /upload terpisah, menghindari masalah 404/405 di Hugging Face SSR proxy.
 */

import { verifyTurnstileToken } from '@/lib/turnstile'
import { checkRateLimit } from '@/lib/rate-limit'
import { executeGradioInference, resolveForwardedIp } from '@/lib/hf-inference'

const HF_SPACE_URL = (process.env.NEXT_PUBLIC_HF_SPACE_URL || 'https://ilhamdev-rembg.hf.space').replace(/\/+$/, '')
const TIMEOUT_MS = 90_000 // 90 detik untuk toleransi ZeroGPU cold start
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const ALLOWED_MODELS = [
  'birefnet-portrait',
  'birefnet-general',
  'isnet-general-use',
  'isnet-anime',
  'u2net',
  'u2net_human_seg',
]

export async function POST(request) {
  try {
    // ── STEP 0: Identifikasi IP & Rate Limiting ────────────────────────────
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('cf-connecting-ip') || '127.0.0.1'
    const rateLimit = checkRateLimit(clientIp, 15, 60_000)
    if (!rateLimit.allowed) {
      return Response.json(
        { error: 'Terlalu banyak permintaan. Harap tunggu sesaat sebelum mencoba lagi.' },
        {
          status: 429,
          headers: { 'Retry-After': Math.ceil(rateLimit.resetMs / 1000).toString() },
        }
      )
    }

    const formData = await request.formData()
    const imageFile = formData.get('image')
    const rawModelName = formData.get('model_name') || 'birefnet-portrait'
    const modelName = ALLOWED_MODELS.includes(rawModelName) ? rawModelName : 'birefnet-portrait'
    const alphaMatting = formData.get('alpha_matting') === 'true'
    const turnstileToken = formData.get('turnstile_token')

    // ── STEP 1: Verifikasi Keamanan Cloudflare Turnstile ──────────────────
    const turnstileVerification = await verifyTurnstileToken({
      token: turnstileToken,
      remoteIp: clientIp,
    })

    if (!turnstileVerification.success) {
      return Response.json(
        { error: turnstileVerification.error || 'Verifikasi keamanan Turnstile gagal. Silakan muat ulang atau coba lagi.' },
        { status: 403 }
      )
    }

    if (!imageFile || typeof imageFile.arrayBuffer !== 'function') {
      return Response.json({ error: 'Tidak ada file gambar yang valid dikirim' }, { status: 400 })
    }

    if (imageFile.size > MAX_FILE_SIZE) {
      return Response.json({ error: 'Ukuran file gambar melebihi batas maksimum 20MB' }, { status: 400 })
    }

    const mimeType = imageFile.type || 'image/png'
    if (!mimeType.startsWith('image/')) {
      return Response.json({ error: 'Format berkas tidak didukung. Harap unggah gambar JPG, PNG, atau WEBP.' }, { status: 400 })
    }

    // ── STEP 2: Konversi file gambar ke Base64 Data URL ────────────────────
    const arrayBuffer = await imageFile.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const dataUrl = `data:${mimeType};base64,${base64}`

    // ── STEP 2: Eksekusi Inferensi Hugging Face (ZeroGPU / CPU Fallback) ───
    const forwardedIp = resolveForwardedIp(request)

    const { result, endpointUsed, isGpu } = await executeGradioInference({
      spaceUrl: HF_SPACE_URL,
      dataPayload: [dataUrl, modelName, alphaMatting],
      clientIp: forwardedIp,
      timeoutMs: TIMEOUT_MS,
    })

    if (!result) {
      return Response.json(
        { error: 'Proses background removal tidak menghasilkan output. Silakan coba kembali.' },
        { status: 502 }
      )
    }

    // ── STEP 3: Format Kembalian Gambar ───────────────────────────────────
    if (typeof result === 'string') {
      const finalImage = result.startsWith('data:') ? result : `data:image/png;base64,${result}`
      return Response.json({
        success: true,
        image: finalImage,
        engine: endpointUsed,
        isGpu,
      })
    }

    // Fallback jika format Gradio file object { path, url }
    let imgUrl = result.url || result.path
    if (imgUrl) {
      if (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:')) {
        imgUrl = `${HF_SPACE_URL}/gradio_api/file=${imgUrl}`
      }
      const fileRes = await fetch(imgUrl)
      if (fileRes.ok) {
        const buf = await fileRes.arrayBuffer()
        const mime = fileRes.headers.get('content-type') || 'image/png'
        return Response.json({
          success: true,
          image: `data:${mime};base64,${Buffer.from(buf).toString('base64')}`,
          engine: endpointUsed,
          isGpu,
        })
      }
    }

    return Response.json({ error: 'Format output dari HuggingFace tidak dikenali' }, { status: 502 })

  } catch (err) {
    if (err.name === 'AbortError') {
      return Response.json(
        { error: 'Timeout 90 detik. Model ZeroGPU sedang cold start, silakan coba lagi.' },
        { status: 504 }
      )
    }
    console.error('[API Handler Error]', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
