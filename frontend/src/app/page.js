'use client'

import { useState, useRef, useCallback } from 'react'
import './globals.css'

const MODELS = [
  { value: 'birefnet-portrait', label: '👤 BiRefNet Portrait — Terbaik untuk orang' },
  { value: 'birefnet-general', label: '📦 BiRefNet General — Terbaik untuk objek/produk' },
  { value: 'isnet-general-use', label: '⚡ ISNet General — Seimbang: cepat & bagus' },
  { value: 'u2net_human_seg', label: '🚀 U2Net Human — Ringan untuk orang' },
]

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

  const fileInputRef = useRef(null)

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('File harus berupa gambar (JPG, PNG, WEBP)')
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
    handleFile(e.target.files[0])
  }

  const handleRemoveBg = async () => {
    if (!imageFile) return

    setLoading(true)
    setError(null)
    setResultUrl(null)
    setProgress(0)

    // Simulasi progress
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + Math.random() * 15, 85))
    }, 800)

    try {
      const formData = new FormData()
      formData.append('image', imageFile)
      formData.append('model_name', model)
      formData.append('alpha_matting', alphaMatting.toString())

      const res = await fetch('/api/remove-bg', {
        method: 'POST',
        body: formData,
      })

      clearInterval(progressInterval)
      setProgress(95)

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Terjadi kesalahan pada server')
      }

      // API route sekarang mengembalikan base64 langsung di data.image
      if (!data.image) throw new Error('Tidak ada gambar hasil dari server')

      setProgress(100)
      setResultUrl(data.image)  // base64 data URL, langsung bisa dipakai sebagai src
    } catch (err) {
      clearInterval(progressInterval)
      setError(err.message)
    } finally {
      setLoading(false)
      setTimeout(() => setProgress(0), 1000)
    }
  }

  const handleReset = () => {
    setPreviewUrl(null)
    setResultUrl(null)
    setImageFile(null)
    setError(null)
    setProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDownload = () => {
    if (!resultUrl) return
    const a = document.createElement('a')
    a.href = resultUrl
    a.download = `rembg_${imageFile?.name?.replace(/\.[^.]+$/, '') || 'result'}.png`
    a.click()
  }

  return (
    <div className="app-wrapper">
      {/* Header */}
      <header className="header">
        <div className="container">
          <div className="header-inner">
            <a className="logo" href="/">
              <div className="logo-icon">✂️</div>
              <span className="logo-text">RemBG</span>
            </a>
            <div className="header-badge">
              <div className="badge-dot" />
              Powered by ZeroGPU
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="hero">
        <div className="container">
          <div className="hero-label">
            🤖 AI Background Removal
          </div>
          <h1>
            Hapus Background Foto<br />
            <span>Secara Otomatis</span>
          </h1>
          <p className="hero-desc">
            Upload foto, pilih model AI terbaik, dan dapatkan hasil dengan background transparan dalam hitungan detik. Gratis, presisi tinggi, tanpa watermark.
          </p>
        </div>
      </section>

      {/* Main Tool */}
      <main>
        <div className="container">
          <div className="main-card">
            {/* Settings */}
            <div className="settings-row">
              <div>
                <div className="field-label">Model AI</div>
                <div className="select-wrapper">
                  <select
                    id="model-select"
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    disabled={loading}
                  >
                    {MODELS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <span className="select-arrow">▾</span>
                </div>
              </div>
              <div>
                <div className="field-label">Alpha Matting</div>
                <div className="toggle-group">
                  <label className="toggle">
                    <input
                      id="alpha-toggle"
                      type="checkbox"
                      checked={alphaMatting}
                      onChange={e => setAlphaMatting(e.target.checked)}
                      disabled={loading}
                    />
                    <div className="toggle-track" />
                    <div className="toggle-thumb" />
                  </label>
                  <span className="toggle-label">
                    {alphaMatting ? '✅ Aktif' : 'Haluskan edge rambut'}
                  </span>
                </div>
              </div>
            </div>

            {/* Upload Zone */}
            <input
              ref={fileInputRef}
              id="file-input"
              type="file"
              accept="image/*"
              onChange={handleFileInput}
            />
            <div
              className={`upload-zone ${dragover ? 'dragover' : ''} ${previewUrl ? 'has-image' : ''}`}
              onClick={() => !previewUrl && fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              id="upload-dropzone"
            >
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="preview-image" />
              ) : (
                <>
                  <span className="upload-icon">🖼️</span>
                  <div className="upload-title">Drop gambar di sini atau klik untuk upload</div>
                  <div className="upload-sub">
                    Mendukung <span>JPG, PNG, WEBP</span> · Maks <span>20MB</span>
                  </div>
                </>
              )}
            </div>

            {/* Progress Bar */}
            {loading && (
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="error-msg" id="error-message">
                ⚠️ {error}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
              <button
                id="remove-bg-btn"
                className="btn-remove"
                onClick={handleRemoveBg}
                disabled={!imageFile || loading}
              >
                {loading ? (
                  <>
                    <div className="spinner" />
                    Memproses dengan AI...
                  </>
                ) : (
                  <>
                    ✂️ Hapus Background
                  </>
                )}
              </button>
              {previewUrl && (
                <button
                  id="reset-btn"
                  className="btn-reset"
                  onClick={handleReset}
                  style={{ minWidth: 'auto', padding: '12px 16px' }}
                >
                  🔄
                </button>
              )}
            </div>
          </div>

          {/* Result */}
          {resultUrl && (
            <div className="result-section" id="result-section">
              <div className="section-title">
                ✅ Hasil Background Removed
              </div>
              <div className="result-card">
                <div className="result-canvas">
                  <img src={resultUrl} alt="Hasil remove background" className="result-img" id="result-image" />
                </div>
                <div className="result-actions">
                  <button
                    id="download-btn"
                    className="btn-download"
                    onClick={handleDownload}
                  >
                    ⬇️ Download PNG Transparan
                  </button>
                  <button
                    id="try-again-btn"
                    className="btn-reset"
                    onClick={handleReset}
                  >
                    🔄 Coba Lagi
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Features */}
      <section className="features">
        <div className="container">
          <div className="features-grid">
            {[
              { icon: '🤖', title: 'Powered by ZeroGPU', desc: 'Berjalan di HuggingFace ZeroGPU — gratis, cepat, dan tanpa antrian.' },
              { icon: '🎯', title: '4 Model AI', desc: 'Pilih model terbaik sesuai kebutuhan: portrait, produk, atau objek umum.' },
              { icon: '💎', title: 'Kualitas HD', desc: 'Hasilkan PNG transparan berkualitas tinggi tanpa kompresi.' },
              { icon: '🔒', title: 'Privasi Terjaga', desc: 'Gambar tidak disimpan. Diproses langsung dan langsung dibuang.' },
            ].map((f) => (
              <div key={f.title} className="feature-card">
                <span className="feature-icon">{f.icon}</span>
                <div className="feature-title">{f.title}</div>
                <div className="feature-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <p className="footer-text">
            © 2026 RemBG · Backend:{' '}
            <a href="https://huggingface.co/spaces/ilhamdev/rembg" target="_blank" rel="noopener">
              HuggingFace Space ilhamdev/rembg
            </a>{' '}
            · Dibuat dengan ❤️
          </p>
        </div>
      </footer>
    </div>
  )
}
