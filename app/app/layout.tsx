import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Sidebar } from '@/components/Sidebar'
import { SessionProviderWrapper } from '@/components/SessionProviderWrapper'

export const metadata: Metadata = {
  title: 'Product Factory',
  description: 'Pack your digital products. List on Etsy.',
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <SessionProviderWrapper session={session}>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(76,29,149,.16),transparent_38%),#09090b]">
        <Sidebar />
        <main className="ml-56 min-w-0 min-h-screen overflow-x-hidden overflow-y-auto">
          {children}
        </main>
      </div>
    </SessionProviderWrapper>
  )
}
