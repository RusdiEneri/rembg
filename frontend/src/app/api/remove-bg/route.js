/**
 * API Route: /api/remove-bg
 *
 * Flow Gradio 4+ yang benar:
 *   1. Upload gambar ke POST /upload → dapat temp file path
 *   2. POST ke /call/remove_bg dengan file path → dapat event_id
 *   3. GET SSE stream /call/remove_bg/{event_id} → parse hasil
 *   4. Fetch gambar hasil → kirim sebagai base64 ke frontend
 */

const HF_SPACE_URL = process.env.NEXT_PUBLIC_HF_SPACE_URL || 'https://ilhamdev-rembg.hf.space'

// Timeout untuk SSE stream (60 detik)
const TIMEOUT_MS = 60_000

export async function POST(request) {
  try {
    const formData = await request.formData()
    const imageFile = formData.get('image')
    const modelName = formData.get('model_name') || 'birefnet-portrait'
    const alphaMatting = formData.get('alpha_matting') === 'true'

    if (!imageFile) {
      return Response.json({ error: 'No image provided' }, { status: 400 })
    }

    // ── STEP 1: Upload gambar ke HuggingFace ──────────────────────────────
    const uploadForm = new FormData()
    const blob = new Blob([await imageFile.arrayBuffer()], { type: imageFile.type || 'image/png' })
    uploadForm.append('files', blob, imageFile.name || 'image.png')

    const uploadRes = await fetch(`${HF_SPACE_URL}/upload`, {
      method: 'POST',
      body: uploadForm,
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      console.error('[Upload Error]', uploadRes.status, errText)
      return Response.json(
        { error: `Gagal upload ke HuggingFace: ${uploadRes.status}` },
        { status: 502 }
      )
    }

    // Respons berupa array path: ["/tmp/gradio/xxx/image.png"]
    const uploadedPaths = await uploadRes.json()
    const filePath = uploadedPaths[0]

    if (!filePath) {
      return Response.json({ error: 'Upload berhasil tapi path kosong' }, { status: 502 })
    }

    // ── STEP 2: Call /call/remove_bg → dapat event_id ────────────────────
    const callPayload = {
      data: [
        { path: filePath },  // Gradio 4 menerima object {path}
        modelName,
        alphaMatting,
      ]
    }

    const callRes = await fetch(`${HF_SPACE_URL}/call/remove_bg`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(callPayload),
    })

    if (!callRes.ok) {
      const errText = await callRes.text()
      console.error('[Call Error]', callRes.status, errText)
      return Response.json(
        { error: `Gagal panggil API HuggingFace: ${callRes.status} — ${errText.slice(0, 200)}` },
        { status: 502 }
      )
    }

    const { event_id } = await callRes.json()
    if (!event_id) {
      return Response.json({ error: 'Tidak mendapat event_id dari HuggingFace' }, { status: 502 })
    }

    // ── STEP 3: Baca SSE stream dari /call/remove_bg/{event_id} ──────────
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const sseRes = await fetch(`${HF_SPACE_URL}/call/remove_bg/${event_id}`, {
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!sseRes.ok) {
      return Response.json(
        { error: `Gagal membaca hasil dari HuggingFace: ${sseRes.status}` },
        { status: 502 }
      )
    }

    // Parse SSE — cari event "complete" dengan data hasil
    const sseText = await sseRes.text()
    let resultData = null
    let hasError = false
    let errorMsg = ''

    const lines = sseText.split('\n')
    let currentEvent = ''

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        const rawData = line.slice(6).trim()

        if (currentEvent === 'error') {
          hasError = true
          errorMsg = rawData
          break
        }

        if (currentEvent === 'complete') {
          try {
            const parsed = JSON.parse(rawData)
            if (Array.isArray(parsed) && parsed.length > 0) {
              resultData = parsed[0]
            }
          } catch {
            // skip
          }
        }
      }
    }

    if (hasError) {
      return Response.json({ error: `HuggingFace error: ${errorMsg}` }, { status: 502 })
    }

    if (!resultData) {
      return Response.json({ error: 'Tidak ada data hasil dari HuggingFace' }, { status: 502 })
    }

    // ── STEP 4: Fetch gambar hasil → kembalikan sebagai base64 ───────────
    // resultData.url atau resultData.path
    let imgUrl = resultData.url || resultData.path || resultData

    // Jika path relatif, tambahkan base URL
    if (typeof imgUrl === 'string' && !imgUrl.startsWith('http')) {
      imgUrl = `${HF_SPACE_URL}/file=${imgUrl}`
    }

    const imgRes = await fetch(imgUrl)
    if (!imgRes.ok) {
      // Coba format URL alternatif HF
      const altUrl = `${HF_SPACE_URL}/file=${resultData.path || resultData}`
      const altRes = await fetch(altUrl)
      if (!altRes.ok) {
        return Response.json({ error: 'Gagal mengambil gambar hasil' }, { status: 502 })
      }
      const arrayBuffer = await altRes.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      return Response.json({
        success: true,
        image: `data:image/png;base64,${base64}`,
      })
    }

    const arrayBuffer = await imgRes.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    return Response.json({
      success: true,
      image: `data:image/png;base64,${base64}`,
    })

  } catch (error) {
    if (error.name === 'AbortError') {
      return Response.json({ error: 'Timeout: proses terlalu lama (>60 detik)' }, { status: 504 })
    }
    console.error('[API Error]', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
