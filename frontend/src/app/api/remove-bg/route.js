/**
 * API Route: /api/remove-bg
 *
 * Mengirim gambar langsung sebagai base64 ke HuggingFace Gradio Space (ZeroGPU).
 * Tidak memerlukan endpoint /upload terpisah, menghindari masalah 404/405 di Hugging Face SSR proxy.
 */

const HF_SPACE_URL = (process.env.NEXT_PUBLIC_HF_SPACE_URL || 'https://ilhamdev-rembg.hf.space').replace(/\/+$/, '')
const TIMEOUT_MS = 90_000 // 90 detik untuk toleransi ZeroGPU cold start

export async function POST(request) {
  try {
    const formData = await request.formData()
    const imageFile = formData.get('image')
    const modelName = formData.get('model_name') || 'birefnet-portrait'
    const alphaMatting = formData.get('alpha_matting') === 'true'

    if (!imageFile) {
      return Response.json({ error: 'Tidak ada file gambar yang dikirim' }, { status: 400 })
    }

    // ── STEP 1: Konversi file gambar ke Base64 Data URL ────────────────────
    const arrayBuffer = await imageFile.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = imageFile.type || 'image/png'
    const dataUrl = `data:${mimeType};base64,${base64}`

    const payload = {
      data: [dataUrl, modelName, alphaMatting],
    }

    // ── STEP 2: POST ke Gradio API Endpoint ────────────────────────────────
    // Coba path standar Hugging Face (/gradio_api/call/remove_bg), lalu fallback ke (/call/remove_bg)
    const candidateEndpoints = [
      `${HF_SPACE_URL}/gradio_api/call/remove_bg`,
      `${HF_SPACE_URL}/call/remove_bg`,
    ]

    let callRes = null
    let usedEndpoint = ''
    let lastErrorText = ''

    for (const endpoint of candidateEndpoints) {
      try {
        console.log('[Connecting] Mengirim request ke:', endpoint)
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(payload),
        })

        if (res.ok) {
          callRes = res
          usedEndpoint = endpoint
          break
        } else {
          lastErrorText = await res.text()
          console.warn(`[Endpoint ${res.status}] ${endpoint}:`, lastErrorText.slice(0, 120))
        }
      } catch (err) {
        console.warn(`[Fetch Fail] ${endpoint}:`, err.message)
      }
    }

    if (!callRes) {
      return Response.json(
        {
          error: `Gagal memanggil backend HuggingFace. Status server mungkin sedang starting/rebuilding: ${lastErrorText.slice(0, 100) || 'Connection failed'}`,
        },
        { status: 502 }
      )
    }

    const { event_id } = await callRes.json()
    if (!event_id) {
      return Response.json({ error: 'HuggingFace tidak mengembalikan event_id' }, { status: 502 })
    }
    console.log('[Call OK] event_id:', event_id)

    // ── STEP 3: Baca SSE Stream untuk mengambil hasil ──────────────────────
    const sseUrl = `${usedEndpoint}/${event_id}`
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
        { error: `Gagal membaca SSE status dari HuggingFace: ${sseRes.status}` },
        { status: 502 }
      )
    }

    const sseText = await sseRes.text()
    console.log('[SSE Status received, length:]', sseText.length)

    let resultOutput = null
    let errorMsg = null
    const lines = sseText.split('\n')
    let currentEvent = ''

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
            console.error('[SSE parse error]', raw.slice(0, 100))
          }
        }
      }
    }

    if (errorMsg) {
      return Response.json({ error: `Gradio inference error: ${errorMsg}` }, { status: 502 })
    }

    if (!resultOutput) {
      return Response.json(
        { error: 'ZeroGPU belum selesai atau sedang antre. Silakan coba kembali sesaat lagi.' },
        { status: 502 }
      )
    }

    // ── STEP 4: Format Kembalian Gambar ───────────────────────────────────
    // Jika resultOutput adalah base64 data URL langsung (sesuai fungsi remove_bg_api kita)
    if (typeof resultOutput === 'string') {
      if (resultOutput.startsWith('data:')) {
        return Response.json({ success: true, image: resultOutput })
      }
      return Response.json({
        success: true,
        image: `data:image/png;base64,${resultOutput}`,
      })
    }

    // Fallback jika berupa objek file Gradio { path, url }
    let imgUrl = resultOutput.url || resultOutput.path
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
