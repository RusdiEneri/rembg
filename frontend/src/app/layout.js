import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'RemBG — AI Background Remover',
  description: 'Hapus background foto secara otomatis menggunakan AI. Powered by HuggingFace ZeroGPU & rembg.',
  keywords: 'remove background, hapus background, AI, rembg, transparan',
  openGraph: {
    title: 'RemBG — AI Background Remover',
    description: 'Hapus background foto otomatis dengan AI. Gratis, cepat, presisi tinggi.',
    type: 'website',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
