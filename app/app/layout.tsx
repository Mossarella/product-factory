import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Product Factory — MossarellaStudio',
  description: 'Pack your digital products. List on Etsy.',
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
