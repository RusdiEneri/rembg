/**
 * API Route: /api/remove-bg
 * Proxy ke HuggingFace Gradio API untuk menghindari CORS issue dari browser.
 * Frontend mengirim form-data berisi image, lalu route ini meneruskan ke HF.
 */

const HF_SPACE_URL = process.env.NEXT_PUBLIC_HF_SPACE_URL || 'https://ilhamdev-rembg.hf.space'

/**
 * Konversi ArrayBuffer image ke base64 string untuk Gradio API
 */
function bufferToBase64(buffer) {
  return Buffer.from(buffer).toString('base64')
}

export async function POST(request) {
  try {
    const formData = await request.formData()
    const imageFile = formData.get('image')
    const modelName = formData.get('model_name') || 'birefnet-portrait'
    const alphaMatting = formData.get('alpha_matting') === 'true'

    if (!imageFile) {
      return Response.json({ error: 'No image provided' }, { status: 400 })
    }

    // Konversi File ke ArrayBuffer → base64
    const arrayBuffer = await imageFile.arrayBuffer()
    const base64 = bufferToBase64(arrayBuffer)
    const mimeType = imageFile.type || 'image/png'
    const dataUrl = `data:${mimeType};base64,${base64}`

    // Panggil Gradio API - format sesuai Gradio v4+ (/call/ SSE atau /api/ langsung)
    // Gunakan /api/predict untuk single call (lebih simpel dari SSE)
    const gradioPayload = {
      data: [
        { path: dataUrl, mime_type: mimeType, orig_name: imageFile.name || 'image.png' },
        modelName,
        alphaMatting,
      ]
    }

    // Langkah 1: POST ke /call/remove_bg untuk dapat event_id
    const callRes = await fetch(`${HF_SPACE_URL}/call/remove_bg`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gradioPayload),
    })

    if (!callRes.ok) {
      const errText = await callRes.text()
      console.error('[HF API Error]', callRes.status, errText)
      return Response.json({ error: `HuggingFace API error: ${callRes.status}` }, { status: 502 })
    }

    const { event_id } = await callRes.json()

    // Langkah 2: GET /call/remove_bg/{event_id} untuk ambil hasil (SSE stream)
    const resultRes = await fetch(`${HF_SPACE_URL}/call/remove_bg/${event_id}`, {
      headers: { Accept: 'text/event-stream' },
    })

    if (!resultRes.ok) {
      return Response.json({ error: 'Failed to get result from HuggingFace' }, { status: 502 })
    }

    // Parse SSE response
    const resultText = await resultRes.text()
    const lines = resultText.split('\n')
    let resultData = null

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(line.slice(6))
          if (Array.isArray(parsed) && parsed.length > 0) {
            resultData = parsed[0]
          }
        } catch {
          // skip non-JSON lines
        }
      }
    }

    if (!resultData) {
      return Response.json({ error: 'No result data from HuggingFace' }, { status: 502 })
    }

    // resultData bisa berupa { path, url } atau string base64
    // Kembalikan URL atau base64 ke frontend
    return Response.json({ success: true, result: resultData })

  } catch (error) {
    console.error('[API Error]', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
