import Link from 'next/link'
import ThemeToggle from './theme-toggle'

export const metadata = {
  title: '404: Halaman Tidak Ditemukan - RemBG',
  description: 'Halaman yang Anda tuju tidak ditemukan atau telah dipindahkan.',
}

export default function NotFound() {
  return (
    <div className="app-wrapper">
      <header className="header">
        <div className="container">
          <div className="header-inner">
            <Link href="/" className="logo" aria-label="RemBG Beranda">
              <span className="logo-badge" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <line x1="20" y1="4" x2="8.12" y2="15.88" />
                  <line x1="14.47" y1="14.48" x2="20" y2="20" />
                  <line x1="8.12" y1="8.12" x2="12" y2="12" />
                </svg>
              </span>
              <div className="logo-title-group">
                <span className="logo-text">RemBG</span>
                <span className="logo-sub">AI CUTOUT</span>
              </div>
            </Link>

            <div className="header-meta">
              <ThemeToggle />
              <Link href="/" className="hf-link" aria-label="Kembali ke Beranda">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                <span>Beranda</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }}>
        <div className="container" style={{ maxWidth: '640px' }}>
          <div
            className="main-card"
            style={{
              textAlign: 'center',
              padding: '48px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '20px',
            }}
          >
            <div
              style={{
                display: 'inline-block',
                background: '#FFEB3B',
                color: '#000000',
                border: '3px solid #000000',
                boxShadow: '4px 4px 0px #000000',
                padding: '6px 16px',
                fontWeight: 900,
                fontSize: '1.25rem',
                fontFamily: 'var(--font-mono, monospace)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Kesalahan 404
            </div>

            <h1
              style={{
                fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
                fontWeight: 900,
                lineHeight: 1.15,
                margin: '8px 0',
                letterSpacing: '-0.02em',
              }}
            >
              Halaman Tidak Ditemukan
            </h1>

            <p
              style={{
                color: 'var(--text-secondary, #52525b)',
                fontSize: '1rem',
                maxWidth: '460px',
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              Tautan yang Anda tuju mungkin salah ketik, sudah dihapus, atau berkas telah dipindahkan ke direktori lain.
            </p>

            <div style={{ marginTop: '12px' }}>
              <Link
                href="/"
                className="btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  textDecoration: 'none',
                  fontSize: '0.95rem',
                  padding: '12px 24px',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                Kembali ke Halaman Utama
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <span className="footer-text">
              RemBG • Pemotong Latar Belakang Foto
            </span>
            <div className="footer-links">
              <Link href="/" className="footer-link">
                Beranda
              </Link>
              <a
                href="https://huggingface.co/spaces/ilhamdev/rembg"
                target="_blank"
                rel="noreferrer"
                className="footer-link"
              >
                Hugging Face Space
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
