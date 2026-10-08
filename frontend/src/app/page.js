'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'
import { DEFAULT_TEST_SITE_KEY } from '@/lib/turnstile'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || DEFAULT_TEST_SITE_KEY

const MODELS = [
  { value: 'birefnet-portrait', label: 'BiRefNet Portrait (Optimal untuk manusia & rambut)' },
  { value: 'birefnet-general', label: 'BiRefNet General (Optimal untuk produk & objek)' },
  { value: 'isnet-general-use', label: 'ISNet General (Serbaguna, cepat & seimbang)' },
  { value: 'isnet-anime', label: 'ISNet Anime (Optimal untuk kartun, anime & ilustrasi)' },
  { value: 'u2net', label: 'U2Net (Model umum klasik yang stabil)' },
  { value: 'u2net_human_seg', label: 'U2Net Human (Segmentasi manusia ringan)' },
]

function formatFileSize(bytes) {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  const kb = bytes / 1024
  return `${kb.toFixed(0)} KB`
}

export default function Home() {
  const [previewUrl, setPreviewUrl] = useState(null)
  const [resultUrl, setResultUrl] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [model, setModel] = useState('birefnet-portrait')
  const [alphaMatting, setAlphaMatting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(0)
  const [dragover, setDragover] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState(null)
  const [inspectorBg, setInspectorBg] = useState('checkerboard')

  const fileInputRef = useRef(null)
  const turnstileRef = useRef(null)

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('File harus berupa gambar (JPG, PNG, atau WEBP)')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('Ukuran file maksimal 20MB')
      return
    }
    setError(null)
    setResultUrl(null)
    setImageFile(file)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
  }, [])

  // Dukungan paste gambar dari clipboard
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) handleFile(file)
          break
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [handleFile])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragover(false)
    const file = e.dataTransfer.files[0]
    handleFile(file)
  }, [handleFile])

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragover(true)
  }

  const handleDragLeave = () => setDragover(false)

  const handleFileInput = (e) => {
    if (e.target.files?.[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleRemoveBg = async () => {
    if (!imageFile) return

    if (!turnstileToken) {
      setError('Mohon selesaikan verifikasi keamanan Turnstile terlebih dahulu.')
      return
    }

    setLoading(true)
    setError(null)
    setResultUrl(null)
    setProgress(0)

    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + Math.random() * 15, 85))
    }, 800)

    try {
      const formData = new FormData()
      formData.append('image', imageFile)
      formData.append('model_name', model)
      formData.append('alpha_matting', alphaMatting.toString())
      formData.append('turnstile_token', turnstileToken)

      const res = await fetch('/api/remove-bg', {
        method: 'POST',
        body: formData,
      })

      clearInterval(progressInterval)
      setProgress(95)

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Terjadi kesalahan pada server saat memproses gambar')
      }

      if (!data.image) {
        throw new Error('Tidak ada gambar hasil dari server')
      }

      setProgress(100)
      setResultUrl(data.image)
    } catch (err) {
      clearInterval(progressInterval)
      setError(err.message)
    } finally {
      setLoading(false)
      setTimeout(() => setProgress(0), 1000)
      turnstileRef.current?.reset()
      setTurnstileToken(null)
    }
  }

  const handleReset = () => {
    setPreviewUrl(null)
    setResultUrl(null)
    setImageFile(null)
    setError(null)
    setProgress(0)
    turnstileRef.current?.reset()
    setTurnstileToken(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDownload = () => {
    if (!resultUrl) return
    const a = document.createElement('a')
    a.href = resultUrl
    const baseName = imageFile?.name?.replace(/\.[^.]+$/, '') || 'hasil'
    a.download = `${baseName}-nobg.png`
    a.click()
  }

  return (
    <div className="app-wrapper">
      {/* Header */}
      <header className="header">
        <div className="container">
          <div className="header-inner">
            <a className="logo" href="/" aria-label="RemBG Beranda">
              <span className="logo-badge" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="3"/>
                  <circle cx="6" cy="18" r="3"/>
                  <line x1="20" y1="4" x2="8.12" y2="15.88"/>
                  <line x1="14.47" y1="14.48" x2="20" y2="20"/>
                  <line x1="8.12" y1="8.12" x2="12" y2="12"/>
                </svg>
              </span>
              <span className="logo-text">RemBG</span>
            </a>
            <div className="header-meta">
              <span className="system-status">
                <span className="status-dot" aria-hidden="true" />
                ZeroGPU Online
              </span>
              <a
                href="https://huggingface.co/spaces/ilhamdev/rembg"
                target="_blank"
                rel="noreferrer"
                className="hf-link"
              >
                Hugging Face Space
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="hero">
        <div className="container">
          <h1>Hapus Background Foto Otomatis</h1>
          <p className="hero-desc">
            Pemisahan objek foto secara presisi dengan model BiRefNet dan ISNet. Diproses tanpa watermark dengan resolusi penuh.
          </p>
        </div>
      </section>

      {/* Main Card */}
      <main>
        <div className="container">
          <div className="main-card">
            {/* Konfigurasi Model */}
            <div className="config-grid">
              <div className="field-group">
                <label htmlFor="model-select" className="field-label">Model Segmentasi</label>
                <select
                  id="model-select"
                  className="select-control"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={loading}
                >
                  {MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div className="field-group">
                <span className="field-label">Detail Tepi</span>
                <label className="toggle-card" htmlFor="alpha-toggle">
                  <input
                    id="alpha-toggle"
                    type="checkbox"
                    checked={alphaMatting}
                    onChange={(e) => setAlphaMatting(e.target.checked)}
                    disabled={loading}
                  />
                  <span className="toggle-text">
                    Alpha Matting (helai rambut)
                  </span>
                </label>
              </div>
            </div>

            {/* Input Tersembunyi */}
            <input
              ref={fileInputRef}
              id="file-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileInput}
              style={{ display: 'none' }}
            />

            {/* Area Dropzone / Pratinjau */}
            {!previewUrl ? (
              <div
                className={`dropzone ${dragover ? 'drag-active' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
                aria-label="Area unggah gambar"
              >
                <div className="dropzone-inner">
                  <div className="dropzone-icon" aria-hidden="true">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </div>
                  <div className="dropzone-title">Pilih file atau tarik gambar ke sini</div>
                  <div className="dropzone-hint">
                    Mendukung JPG, PNG, WEBP (maksimal 20MB) atau tempel (Ctrl+V)
                  </div>
                </div>
              </div>
            ) : (
              <div className="preview-container">
                <div className="preview-media-box">
                  <img
                    src={previewUrl}
                    alt="Pratinjau foto sebelum pemisahan latar belakang"
                    className="preview-img"
                  />
                </div>
                <div className="preview-meta-row">
                  <div className="meta-info">
                    <span>{imageFile?.name}</span>
                    <span>•</span>
                    <span>{formatFileSize(imageFile?.size)}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost-small"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                  >
                    Ganti Foto
                  </button>
                </div>
              </div>
            )}

            {/* Indikator Progres */}
            {loading && (
              <div className="progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
            )}

            {/* Pesan Kesalahan */}
            {error && (
              <div className="error-banner" role="alert">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Cloudflare Turnstile */}
            <div className="turnstile-box">
              <Turnstile
                ref={turnstileRef}
                siteKey={TURNSTILE_SITE_KEY}
                onSuccess={(token) => {
                  setTurnstileToken(token)
                  setError(null)
                }}
                onExpire={() => setTurnstileToken(null)}
                onError={() => {
                  setTurnstileToken(null)
                  setError('Verifikasi Cloudflare Turnstile gagal dimuat. Periksa koneksi internet Anda.')
                }}
                options={{
                  theme: 'dark',
                  size: 'normal',
                }}
              />
              <span className="turnstile-notice">
                Verifikasi keamanan bot Cloudflare
              </span>
            </div>

            {/* Tombol Aksi */}
            <div className="action-row">
              <button
                id="remove-bg-btn"
                className="btn-primary"
                onClick={handleRemoveBg}
                disabled={!imageFile || loading || !turnstileToken}
              >
                {loading ? (
                  <>
                    <span className="spinner-icon" aria-hidden="true" />
                    Sedang Memproses...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Hapus Background
                  </>
                )}
              </button>
              {previewUrl && (
                <button
                  id="reset-btn"
                  className="btn-secondary"
                  onClick={handleReset}
                  disabled={loading}
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Bagian Hasil & Inspeksi Latar Belakang */}
          {resultUrl && (
            <div className="result-section" id="result-section">
              <div className="result-header">
                <span className="result-title">Hasil Pemotongan Background</span>
                <div className="bg-inspector-group" role="group" aria-label="Pilihan latar inspeksi">
                  <button
                    type="button"
                    className={`bg-inspector-btn ${inspectorBg === 'checkerboard' ? 'active' : ''}`}
                    onClick={() => setInspectorBg('checkerboard')}
                  >
                    Transparan
                  </button>
                  <button
                    type="button"
                    className={`bg-inspector-btn ${inspectorBg === 'white' ? 'active' : ''}`}
                    onClick={() => setInspectorBg('white')}
                  >
                    Latar Putih
                  </button>
                  <button
                    type="button"
                    className={`bg-inspector-btn ${inspectorBg === 'dark' ? 'active' : ''}`}
                    onClick={() => setInspectorBg('dark')}
                  >
                    Latar Gelap
                  </button>
                </div>
              </div>

              <div className={`result-canvas ${inspectorBg}`}>
                <img
                  src={resultUrl}
                  alt="Hasil foto dengan background transparan"
                  className="result-image"
                  id="result-image"
                />
              </div>

              <div className="result-footer-actions">
                <button
                  id="download-btn"
                  className="btn-primary"
                  onClick={handleDownload}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Unduh PNG Transparan
                </button>
                <button
                  id="try-again-btn"
                  className="btn-secondary"
                  onClick={handleReset}
                >
                  Coba Foto Lain
                </button>
              </div>

              {/* Panel Proses Ulang dengan Model Alternatif */}
              <div className="reprocess-panel">
                <div className="reprocess-header">
                  <span className="reprocess-title">Hasil Kurang Pas? Coba Model Alternatif</span>
                  <span className="reprocess-desc">
                    Ubah model atau aktifkan Alpha Matting lalu klik proses ulang langsung pada foto ini tanpa upload ulang.
                  </span>
                </div>
                <div className="reprocess-controls">
                  <div className="reprocess-field">
                    <select
                      id="reprocess-model-select"
                      className="select-control"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      disabled={loading}
                    >
                      {MODELS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <label className="toggle-card" htmlFor="reprocess-alpha-toggle">
                    <input
                      id="reprocess-alpha-toggle"
                      type="checkbox"
                      checked={alphaMatting}
                      onChange={(e) => setAlphaMatting(e.target.checked)}
                      disabled={loading}
                    />
                    <span className="toggle-text">
                      Alpha Matting
                    </span>
                  </label>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleRemoveBg}
                    disabled={loading || !turnstileToken}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-icon" aria-hidden="true" />
                        Memproses...
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="23 4 23 10 17 10"/>
                          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                        </svg>
                        Proses Ulang
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Informasi Teknis & Spesifikasi Proyek */}
          <section className="info-section">
            <div className="info-grid">
              <article className="info-card">
                <h2>Panduan Model AI</h2>
                <p>Pilih model yang tepat untuk hasil segmentasi paling optimal:</p>
                <ul className="model-list">
                  <li><strong>BiRefNet Portrait:</strong> Dirancang khusus untuk foto orang, mendeteksi lekuk pakaian dan helai rambut secara halus.</li>
                  <li><strong>BiRefNet General:</strong> Optimal untuk foto produk, kemasan e-commerce, dan benda padat.</li>
                  <li><strong>ISNet General:</strong> Model seimbang dengan kecepatan inferensi tinggi dan kualitas tajam.</li>
                  <li><strong>ISNet Anime:</strong> Spesialis gambar kartun, ilustrasi 2D, anime, dan grafik vektor.</li>
                  <li><strong>U2Net:</strong> Model umum klasik dengan toleransi tinggi terhadap berbagai tipe objek.</li>
                  <li><strong>U2Net Human:</strong> Segmentasi manusia ringan untuk pemrosesan cepat.</li>
                </ul>
              </article>

              <article className="info-card">
                <h2>Spesifikasi & Privasi</h2>
                <ul className="model-list">
                  <li><strong>Format Masukan:</strong> Mendukung JPG, JPEG, PNG, dan WEBP hingga ukuran 20MB.</li>
                  <li><strong>Format Keluaran:</strong> Format PNG 32-bit dengan saluran alpha transparan penuh tanpa kompresi rusak.</li>
                  <li><strong>Pemrosesan Aman:</strong> Gambar diproses langsung pada memori inferensi Hugging Face ZeroGPU dan tidak disimpan secara permanen pada server.</li>
                </ul>
              </article>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <span className="footer-text">
              RemBG: Penghapus Background Foto AI
            </span>
            <div className="footer-links">
              <a
                href="https://huggingface.co/spaces/ilhamdev/rembg"
                target="_blank"
                rel="noreferrer"
                className="footer-link"
              >
                Hugging Face ZeroGPU Space
              </a>
              <a
                href="https://github.com/danielgatis/rembg"
                target="_blank"
                rel="noreferrer"
                className="footer-link"
              >
                Pustaka rembg Python
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
