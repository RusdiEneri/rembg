/**
 * API Route: /api/remove-bg
 *
 * Fix untuk Gradio 6+ dengan SSR mode (Node proxy):
 * - /upload endpoint TIDAK tersedia (404) di SSR mode
 * - Kirim gambar sebagai base64 langsung dalam format ImageData Gradio 6
 * - Format: { path: "data:mime;base64,...", orig_name, mime_type, size, meta }
 */

const HF_SPACE_URL = process.env.NEXT_PUBLIC_HF_SPACE_URL || 'https://ilhamdev-rembg.hf.space'
const TIMEOUT_MS = 90_000  // 90 detik (ZeroGPU bisa cold start)

export async function POST(request) {
  try {
    const formData = await request.formData()
    const imageFile = formData.get('image')
    const modelName = formData.get('model_name') || 'birefnet-portrait'
    const alphaMatting = formData.get('alpha_matting') === 'true'

    if (!imageFile) {
      return Response.json({ error: 'No image provided' }, { status: 400 })
    }

    // ── STEP 1: Konversi gambar ke base64 ─────────────────────────────────
    const arrayBuffer = await imageFile.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = imageFile.type || 'image/png'
    const dataUrl = `data:${mimeType};base64,${base64}`
    const fileName = imageFile.name || 'image.png'
    const fileSize = arrayBuffer.byteLength

    // Format ImageData sesuai Gradio 6 (tanpa perlu /upload dulu)
    const imageData = {
      path: dataUrl,
      url: dataUrl,
      orig_name: fileName,
      mime_type: mimeType,
      size: fileSize,
      is_stream: false,
      meta: { _type: 'gradio.FileData' },
    }

    // ── STEP 2: POST ke /call/remove_bg ──────────────────────────────────
    const callPayload = {
      data: [imageData, modelName, alphaMatting],
    }

    const callController = new AbortController()
    const callTimer = setTimeout(() => callController.abort(), 30_000)

    let callRes
    try {
      callRes = await fetch(`${HF_SPACE_URL}/call/remove_bg`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(callPayload),
        signal: callController.signal,
      })
    } finally {
      clearTimeout(callTimer)
    }

    if (!callRes.ok) {
      const errText = await callRes.text()
      console.error('[Call Error]', callRes.status, errText.slice(0, 300))
      return Response.json(
        { error: `Gagal panggil HuggingFace API: ${callRes.status} — ${errText.slice(0, 150)}` },
        { status: 502 }
      )
    }

    const callJson = await callRes.json()
    const event_id = callJson.event_id

    if (!event_id) {
      console.error('[No event_id]', callJson)
      return Response.json({ error: 'HuggingFace tidak mengembalikan event_id' }, { status: 502 })
    }

    // ── STEP 3: Baca SSE stream hasil ─────────────────────────────────────
    const sseController = new AbortController()
    const sseTimer = setTimeout(() => sseController.abort(), TIMEOUT_MS)

    let sseRes
    try {
      sseRes = await fetch(`${HF_SPACE_URL}/call/remove_bg/${event_id}`, {
        headers: { Accept: 'text/event-stream' },
        signal: sseController.signal,
      })
    } finally {
      clearTimeout(sseTimer)
    }

    if (!sseRes.ok) {
      return Response.json(
        { error: `Gagal membaca hasil SSE: ${sseRes.status}` },
        { status: 502 }
      )
    }

    // Parse SSE — cari event "complete"
    const sseText = await sseRes.text()
    console.log('[SSE Raw]', sseText.slice(0, 500))

    let resultData = null
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
              resultData = parsed[0]
            }
          } catch {
            console.error('[SSE parse error]', raw.slice(0, 100))
          }
        }
      }
    }

    if (errorMsg) {
      return Response.json({ error: `Gradio error: ${errorMsg}` }, { status: 502 })
    }

    if (!resultData) {
      return Response.json(
        { error: 'Tidak ada data hasil dari HuggingFace. Coba lagi setelah beberapa detik.' },
        { status: 502 }
      )
    }

    // ── STEP 4: Ambil gambar hasil sebagai base64 ─────────────────────────
    // resultData bisa berupa { path, url } — path bisa relatif atau absolute
    let imgUrl = resultData.url || resultData.path

    if (!imgUrl) {
      return Response.json({ error: 'Tidak ada URL gambar hasil' }, { status: 502 })
    }

    // Jika path relatif (misal: /tmp/gradio/xxx/image.png)
    if (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:')) {
      imgUrl = `${HF_SPACE_URL}/file=${imgUrl}`
    }

    // Jika sudah base64 data URL, langsung kembalikan
    if (imgUrl.startsWith('data:')) {
      return Response.json({ success: true, image: imgUrl })
    }

    // Fetch gambar dari HF (server-side, tidak ada CORS issue)
    const imgRes = await fetch(imgUrl)
    if (!imgRes.ok) {
      return Response.json(
        { error: `Gagal fetch gambar hasil dari HuggingFace: ${imgRes.status}` },
        { status: 502 }
      )
    }

    const imgBuffer = await imgRes.arrayBuffer()
    const imgBase64 = Buffer.from(imgBuffer).toString('base64')
    const imgMime = imgRes.headers.get('content-type') || 'image/png'

    return Response.json({
      success: true,
      image: `data:${imgMime};base64,${imgBase64}`,
    })

  } catch (err) {
    if (err.name === 'AbortError') {
      return Response.json(
        { error: 'Timeout: proses terlalu lama. ZeroGPU mungkin sedang cold start, coba lagi.' },
        { status: 504 }
      )
    }
    console.error('[API Error]', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
