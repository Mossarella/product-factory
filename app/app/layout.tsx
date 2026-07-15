import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Sidebar } from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'Product Factory — MossarellaStudio',
  description: 'Pack your digital products. List on Etsy.',
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar user={{ email: session.user.email, name: session.user.name }} />
      <main className="ml-56 flex-1 min-h-screen overflow-auto">
        {children}
      </main>
    </div>
  )
}
