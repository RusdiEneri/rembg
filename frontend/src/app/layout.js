import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://rembg.vercel.app').replace(/\/+$/, '')

export const viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
}

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'RemBG: Pemotong Latar Belakang Foto',
  description: 'Pisahkan latar belakang foto menjadi format PNG transparan secara cepat menggunakan model BiRefNet dan ISNet.',
  keywords: [
    'hapus background foto',
    'remove background online',
    'background transparan',
    'rembg online',
    'BiRefNet',
    'potong latar belakang foto',
  ],
  authors: [{ name: 'RemBG' }],
  creator: 'RemBG',
  publisher: 'RemBG',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'RemBG: Pemotong Latar Belakang Foto',
    description: 'Pisahkan latar belakang foto menjadi format PNG transparan secara cepat menggunakan model BiRefNet dan ISNet.',
    url: SITE_URL,
    siteName: 'RemBG',
    locale: 'id_ID',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RemBG: Pemotong Latar Belakang Foto',
    description: 'Pisahkan latar belakang foto menjadi format PNG transparan secara cepat menggunakan model BiRefNet dan ISNet.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      '@id': `${SITE_URL}/#app`,
      name: 'RemBG',
      url: SITE_URL,
      description: 'Aplikasi web penghapus background foto otomatis berbasis AI dengan model BiRefNet dan ISNet.',
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'All',
      browserRequirements: 'Requires JavaScript. Requires HTML5.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
    {
      '@type': 'HowTo',
      '@id': `${SITE_URL}/#howto`,
      name: 'Cara Menghapus Background Foto dengan RemBG',
      description: 'Langkah mudah menghapus background foto secara otomatis menggunakan AI.',
      step: [
        {
          '@type': 'HowToStep',
          name: 'Pilih atau Tarik Foto',
          text: 'Unggah foto berformat JPG, PNG, atau WEBP ke area unggah.',
        },
        {
          '@type': 'HowToStep',
          name: 'Pilih Model AI yang Sesuai',
          text: 'Pilih model BiRefNet Portrait untuk orang atau BiRefNet General untuk produk dan objek.',
        },
        {
          '@type': 'HowToStep',
          name: 'Unduh Hasil PNG Transparan',
          text: 'Klik tombol Hapus Background, periksa hasil pratinjau, dan unduh foto PNG transparan.',
        },
      ],
    },
  ],
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  )
}
