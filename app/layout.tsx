import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { cn } from "@/lib/utils"

const inter = Inter({ 
  subsets: ["latin"], 
  variable: "--font-inter",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Chatpire Research",
  description: "B2B Data Enrichment Platform",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={cn(inter.variable, "font-sans antialiased")}>{children}</body>
    </html>
  )
}
