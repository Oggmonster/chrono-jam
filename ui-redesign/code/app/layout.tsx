import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Space_Mono } from 'next/font/google'

import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
})
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'ChronoJam - Music Quiz Party Game',
  description: 'A party music quiz game. Guess the song, artist, and release year!',
}

export const viewport: Viewport = {
  themeColor: '#f5f0e8',
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${spaceMono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
