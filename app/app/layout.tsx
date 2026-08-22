import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'Product Factory',
  description: 'Pack your digital products. List on Etsy.',
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(76,29,149,.16),transparent_38%),#09090b]">
      <Sidebar />
      <main className="ml-56 min-w-0 min-h-screen overflow-x-hidden overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
