/**
 * API Route: /api/remove-bg
 *
 * Flow yang benar sesuai dokumentasi Gradio resmi:
 *   1. Upload gambar ke /custom/upload (FastAPI endpoint di HF Space)
 *      → dapat URL publik file di HF server
 *   2. POST ke /call/remove_bg dengan { "data": [{"path": url}, model, alpha] }
 *      → dapat event_id
 *   3. GET SSE /call/remove_bg/{event_id}
 *      → parse event:complete → dapat URL gambar hasil
 *   4. Fetch gambar hasil → kembalikan base64 ke browser
 */

const HF_SPACE_URL = process.env.NEXT_PUBLIC_HF_SPACE_URL || 'https://ilhamdev-rembg.hf.space'
const TIMEOUT_MS = 90_000

export async function POST(request) {
  try {
    const formData = await request.formData()
    const imageFile = formData.get('image')
    const modelName = formData.get('model_name') || 'birefnet-portrait'
    const alphaMatting = formData.get('alpha_matting') === 'true'

    if (!imageFile) {
      return Response.json({ error: 'No image provided' }, { status: 400 })
    }

    // ── STEP 1: Upload gambar ke endpoint FastAPI custom di HF Space ──────
    const uploadForm = new FormData()
    const blob = new Blob([await imageFile.arrayBuffer()], { type: imageFile.type || 'image/png' })
    uploadForm.append('file', blob, imageFile.name || 'image.png')

    const uploadRes = await fetch(`${HF_SPACE_URL}/custom/upload`, {
      method: 'POST',
      body: uploadForm,
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      console.error('[Upload Error]', uploadRes.status, errText.slice(0, 200))
      return Response.json(
        { error: `Gagal upload gambar: ${uploadRes.status} — ${errText.slice(0, 100)}` },
        { status: 502 }
      )
    }

    const { url: imageUrl } = await uploadRes.json()
    console.log('[Upload OK] imageUrl:', imageUrl)

    // ── STEP 2: POST ke /call/remove_bg dengan URL file ────────────────────
    // Format sesuai docs Gradio: file input = { "path": "https://..." }
    const callPayload = {
      data: [
        { path: imageUrl },   // URL publik, bukan base64
        modelName,
        alphaMatting,
      ],
    }

    const callRes = await fetch(`${HF_SPACE_URL}/call/remove_bg`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(callPayload),
    })

    if (!callRes.ok) {
      const errText = await callRes.text()
      console.error('[Call Error]', callRes.status, errText.slice(0, 300))
      return Response.json(
        { error: `Gagal panggil HuggingFace API: ${callRes.status} — ${errText.slice(0, 150)}` },
        { status: 502 }
      )
    }

    const { event_id } = await callRes.json()
    if (!event_id) {
      return Response.json({ error: 'HuggingFace tidak mengembalikan event_id' }, { status: 502 })
    }
    console.log('[Call OK] event_id:', event_id)

    // ── STEP 3: Baca SSE stream hasil ─────────────────────────────────────
    const sseController = new AbortController()
    const sseTimer = setTimeout(() => sseController.abort(), TIMEOUT_MS)

    let sseRes
    try {
      sseRes = await fetch(`${HF_SPACE_URL}/call/remove_bg/${event_id}`, {
        signal: sseController.signal,
      })
    } finally {
      clearTimeout(sseTimer)
    }

    if (!sseRes.ok) {
      return Response.json(
        { error: `Gagal baca SSE hasil: ${sseRes.status}` },
        { status: 502 }
      )
    }

    const sseText = await sseRes.text()
    console.log('[SSE Raw first 500]', sseText.slice(0, 500))

    // Parse SSE — cari event "complete"
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
            console.error('[SSE parse fail]', raw.slice(0, 100))
          }
        }
      }
    }

    if (errorMsg) {
      return Response.json({ error: `Gradio error: ${errorMsg}` }, { status: 502 })
    }

    if (!resultData) {
      return Response.json(
        { error: 'Tidak ada data hasil. Coba lagi — ZeroGPU mungkin cold start.' },
        { status: 502 }
      )
    }

    // ── STEP 4: Fetch gambar hasil → kembalikan base64 ────────────────────
    // resultData sesuai docs: { path, url, orig_name, meta }
    // url format: "https://ilhamdev-rembg.hf.space/c/file=/tmp/gradio/xxx/image.png"
    let imgUrl = resultData.url || resultData.path
    console.log('[Result data]', JSON.stringify(resultData).slice(0, 200))

    if (!imgUrl) {
      return Response.json({ error: 'Tidak ada URL gambar hasil dari Gradio' }, { status: 502 })
    }

    // Jika path relatif, buat URL lengkap
    if (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:')) {
      // Format Gradio untuk serve file: /file=/tmp/gradio/xxx/image.png
      imgUrl = `${HF_SPACE_URL}/file=${imgUrl}`
    }

    const imgRes = await fetch(imgUrl)
    if (!imgRes.ok) {
      // Coba format alternatif dengan /c/ prefix (Gradio CDN)
      const altUrl = `${HF_SPACE_URL}/c/file=${resultData.path || ''}`
      console.log('[Retry alt URL]', altUrl)
      const altRes = await fetch(altUrl)
      if (!altRes.ok) {
        return Response.json(
          { error: `Gagal fetch gambar hasil: ${imgRes.status}` },
          { status: 502 }
        )
      }
      const buf = await altRes.arrayBuffer()
      return Response.json({
        success: true,
        image: `data:image/png;base64,${Buffer.from(buf).toString('base64')}`,
      })
    }

    const imgBuf = await imgRes.arrayBuffer()
    const mime = imgRes.headers.get('content-type') || 'image/png'

    return Response.json({
      success: true,
      image: `data:${mime};base64,${Buffer.from(imgBuf).toString('base64')}`,
    })

  } catch (err) {
    if (err.name === 'AbortError') {
      return Response.json(
        { error: 'Timeout 90 detik. ZeroGPU sedang cold start, coba lagi dalam 30 detik.' },
        { status: 504 }
      )
    }
    console.error('[API Error]', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
