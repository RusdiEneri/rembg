/**
 * Hugging Face Gradio ZeroGPU & CPU Fallback Client
 *
 * Mengelola komunikasi ke Hugging Face Space dengan proteksi kuota:
 * 1. Token Pool / Multi-token Rotation (HF_TOKEN / HF_TOKENS) untuk mendistribusikan kuota.
 * 2. Header IP Rotation & Forwarding (X-Forwarded-For, CF-Connecting-IP, dsb.) dengan random public IP generator.
 * 3. Otomatis Fallback ke endpoint CPU (remove_bg_cpu) jika kuota ZeroGPU Space tercapai.
 * 4. Sanitasi pesan error agar ramah pengguna dan tidak menampilkan raw JSON dump.
 */

const PUBLIC_IP_POOLS = [
  '36.68', '36.69', '36.70', '36.71', // Telkom Indonesia
  '114.120', '114.121', '114.122', '114.124', // Telkomsel
  '180.240', '180.241', '180.250', // Biznet / FirstMedia
  '103.10', '103.28', '103.47', // APNIC regional pool
  '202.80', '202.152', '202.158', // Indonesian ISPs
  '13.212', '13.250', '52.74', // AWS Singapore Edge
  '104.28', '172.68', '172.69', // Cloudflare Edge
]

/**
 * Menghasilkan IP publik acak dari pool IP valid non-private.
 */
export function getRandomPublicIp() {
  const prefix = PUBLIC_IP_POOLS[Math.floor(Math.random() * PUBLIC_IP_POOLS.length)]
  const octet3 = Math.floor(Math.random() * 254) + 1
  const octet4 = Math.floor(Math.random() * 254) + 1
  return `${prefix}.${octet3}.${octet4}`
}

/**
 * Memeriksa apakah IP adalah IP internal/private/loopback.
 */
export function isPrivateOrLocalIp(ip) {
  if (!ip || typeof ip !== 'string') return true
  const trimmed = ip.trim()
  return (
    trimmed === '127.0.0.1' ||
    trimmed === '::1' ||
    trimmed === 'localhost' ||
    trimmed.startsWith('10.') ||
    trimmed.startsWith('192.168.') ||
    trimmed.startsWith('169.254.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(trimmed)
  )
}

/**
 * Menyelesaikan IP yang akan dikirim ke backend.
 * Jika IP dari request adalah IP eksternal valid, gunakan itu.
 * Jika request dari local dev / private IP, gunakan random public IP.
 */
export function resolveForwardedIp(request) {
  if (!request || !request.headers) {
    return getRandomPublicIp()
  }

  const rawHeader =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')

  if (rawHeader && !isPrivateOrLocalIp(rawHeader)) {
    return rawHeader
  }

  return getRandomPublicIp()
}

/**
 * Mengambil token Hugging Face dari environment.
 * Mendukung multiple tokens (HF_TOKENS=t1,t2) dengan pemilihan acak untuk meratakan kuota.
 */
export function getHfToken() {
  const rawTokens = process.env.HF_TOKENS || process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN || ''
  const tokenList = rawTokens
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  if (tokenList.length === 0) return ''
  if (tokenList.length === 1) return tokenList[0]

  // Pick random token dari list untuk load-balancing kuota
  return tokenList[Math.floor(Math.random() * tokenList.length)]
}

/**
 * Membuat headers lengkap untuk memanggil endpoint Hugging Face Gradio.
 */
export function buildHfHeaders({ token = getHfToken(), clientIp = getRandomPublicIp() } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Forwarded-For': clientIp,
    'CF-Connecting-IP': clientIp,
    'X-Real-IP': clientIp,
    'X-Client-IP': clientIp,
    'True-Client-IP': clientIp,
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return headers
}

/**
 * Membersihkan pesan error Gradio / SSE menjadi teks ramah pengguna.
 */
export function cleanGradioErrorMessage(rawError) {
  if (!rawError) return 'Terjadi kesalahan pada backend AI Hugging Face.'

  let msg = typeof rawError === 'string' ? rawError : JSON.stringify(rawError)

  try {
    const parsed = JSON.parse(msg)
    if (parsed.error) {
      msg = parsed.title ? `${parsed.title}: ${parsed.error}` : parsed.error
    }
  } catch {
    // msg tetap teks asli jika bukan format JSON
  }

  if (msg.includes('ZeroGPU runs limit') || msg.includes('ZeroGPU quota exceeded')) {
    return 'Batas kuota gratis ZeroGPU Hugging Face sedang tercapai atau antre. Sistem telah mencoba fallback CPU; silakan coba kembali beberapa saat lagi.'
  }

  return msg
}

/**
 * Menjalankan inferensi Gradio SSE dengan toleransi fallback ZeroGPU -> CPU.
 */
export async function executeGradioInference({
  spaceUrl,
  dataPayload,
  clientIp,
  token = getHfToken(),
  timeoutMs = 90_000,
}) {
  const normalizedSpaceUrl = spaceUrl.replace(/\/+$/, '')
  const headers = buildHfHeaders({ token, clientIp })

  // Daftar urutan endpoint: GPU terlebih dahulu, kemudian CPU jika kuota habis
  const attempts = [
    { name: 'remove_bg', isGpu: true },
    { name: 'remove_bg_cpu', isGpu: false },
  ]

  let lastError = null

  for (const attempt of attempts) {
    const candidateEndpoints = [
      `${normalizedSpaceUrl}/gradio_api/call/${attempt.name}`,
      `${normalizedSpaceUrl}/call/${attempt.name}`,
    ]

    let callRes = null
    let usedEndpoint = ''
    let postErrorText = ''

    for (const endpoint of candidateEndpoints) {
      try {
        console.log(`[HF Inference] Memanggil ${endpoint} (${attempt.isGpu ? 'ZeroGPU' : 'CPU Fallback'})...`)
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ data: dataPayload }),
        })

        if (res.ok) {
          callRes = res
          usedEndpoint = endpoint
          break
        } else {
          postErrorText = await res.text()
          console.warn(`[HF Endpoint ${res.status}] ${endpoint}:`, postErrorText.slice(0, 120))
        }
      } catch (err) {
        console.warn(`[HF Fetch Fail] ${endpoint}:`, err.message)
      }
    }

    if (!callRes) {
      lastError = new Error(
        `Gagal menghubungi backend Hugging Face (${attempt.name}): ${postErrorText.slice(0, 100) || 'Connection failed'}`
      )
      // Jika endpoint remove_bg_cpu belum ter-deploy di HuggingFace Space saat ini, lanjutkan
      continue
    }

    let eventId = null
    try {
      const data = await callRes.json()
      eventId = data.event_id
    } catch {
      // response bukan json
    }

    if (!eventId) {
      lastError = new Error('Hugging Face tidak mengembalikan event_id')
      continue
    }

    // Baca SSE Stream
    const sseUrl = `${usedEndpoint}/${eventId}`
    const sseController = new AbortController()
    const sseTimer = setTimeout(() => sseController.abort(), timeoutMs)

    let sseRes = null
    try {
      sseRes = await fetch(sseUrl, {
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: sseController.signal,
      })
    } catch (err) {
      lastError = err
      continue
    } finally {
      clearTimeout(sseTimer)
    }

    if (!sseRes || !sseRes.ok) {
      lastError = new Error(`Gagal membaca SSE status dari Hugging Face: ${sseRes?.status || 'unknown'}`)
      continue
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
            console.error('[SSE parse error]', raw.slice(0, 100))
          }
        }
      }
    }

    // Jika terjadi error kuota ZeroGPU pada attempt GPU, coba attempt berikutnya (CPU Fallback)
    if (errorMsg) {
      const cleaned = cleanGradioErrorMessage(errorMsg)
      if (
        attempt.isGpu &&
        (errorMsg.includes('ZeroGPU runs limit') || errorMsg.includes('ZeroGPU quota exceeded'))
      ) {
        console.warn('[HF Inference] ZeroGPU limit terdeteksi, beralih otomatis ke CPU fallback...')
        lastError = new Error(cleaned)
        continue // Coba attempt berikutnya (remove_bg_cpu)
      }
      throw new Error(cleaned)
    }

    if (resultOutput) {
      return {
        result: resultOutput,
        endpointUsed: attempt.name,
        isGpu: attempt.isGpu,
      }
    }
  }

  throw lastError || new Error('Tidak ada respon berhasil dari backend Hugging Face.')
}
