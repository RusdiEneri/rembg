/** @type {import('next').NextConfig} */
const nextConfig = {
  // Izinkan gambar dari HuggingFace (jika nanti perlu next/image)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ilhamdev-rembg.hf.space',
      },
    ],
  },
}

module.exports = nextConfig
