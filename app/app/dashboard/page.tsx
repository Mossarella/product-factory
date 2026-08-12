import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { greeting, formatDate } from '@/lib/utils'
import { computeStats } from '@/lib/dashboard-stats'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/cn'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const products = await prisma.product.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      complete: true,
      description: true,
      etsyTitle: true,
      etsyTags: true,
      createdAt: true,
      files: { select: { id: true, origName: true } },
    },
  })

  const { total, readyToPublish, needsReview, missingHero, needReadme, thisMonth, noGifPreview, sharedTags } = await computeStats(products)

  const stats = [
    { label: 'Total Products', value: total, color: 'text-zinc-100' },
    { label: 'Ready to Publish', value: readyToPublish, color: 'text-emerald-400' },
    { label: 'Needs Review', value: needsReview, color: 'text-amber-400' },
    { label: 'Missing Hero', value: missingHero, color: missingHero > 0 ? 'text-red-400' : 'text-zinc-500' },
    { label: 'Need README', value: needReadme, color: needReadme > 0 ? 'text-red-400' : 'text-zinc-500' },
    { label: 'Last Export', value: 'Never', color: 'text-zinc-600' },
  ]

  return (
    <div className="min-h-screen max-w-6xl p-5 sm:p-8">
      {/* Greeting */}
      <div className="mb-8 border-b border-white/10 pb-6">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.28em] text-violet-300/70"><span className="h-1.5 w-1.5 bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,.9)]" /> Command deck / overview</div>
        <h1 className="text-3xl font-black uppercase tracking-tight text-zinc-100 font-mono">
          {greeting(session.user.name)}
        </h1>
        <p className="mt-1 text-xs font-mono text-zinc-500">{formatDate()}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(s => (
          <Card key={s.label} className="gap-0 rounded-none border-white/10 bg-zinc-900/55 px-4 !py-4 ring-1 ring-inset ring-violet-400/5 sm:px-5 sm:!py-5">
            <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">
              {s.label}
            </p>
            <p className={`text-4xl font-bold font-mono ${s.color}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Insights */}
      <div className="mt-8 border-t border-white/10 pt-6">
        <p className="mb-4 text-[10px] uppercase tracking-[0.25em] text-violet-300/60 font-mono">Telemetry — This Month</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card className="gap-0 rounded-none border-white/10 bg-zinc-900/55 px-4 !py-4 ring-1 ring-inset ring-violet-400/5 sm:px-5 sm:!py-5">
            <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">This Month</p>
            <p className="text-4xl font-bold font-mono text-zinc-100">{thisMonth}</p>
            <p className="text-xs text-zinc-600 font-mono mt-2">products created</p>
          </Card>

          <Card className="gap-0 rounded-none border-white/10 bg-zinc-900/55 px-4 !py-4 ring-1 ring-inset ring-violet-400/5 sm:px-5 sm:!py-5">
            <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">No GIF Preview</p>
            <p className={`text-4xl font-bold font-mono ${noGifPreview > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
              {noGifPreview}
            </p>
            <p className="text-xs text-zinc-600 font-mono mt-2">products don&apos;t contain a GIF preview</p>
          </Card>

          <Card className="gap-0 rounded-none border-white/10 bg-zinc-900/55 px-4 !py-4 ring-1 ring-inset ring-violet-400/5 sm:px-5 sm:!py-5">
            <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">Identical Tags</p>
            <p className={`text-4xl font-bold font-mono ${sharedTags > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
              {sharedTags}
            </p>
            <p className="text-xs text-zinc-600 font-mono mt-2">products share identical tag sets</p>
          </Card>

          {/*
            TODO: Average Export Time — needs explicit export event tracking
            TODO: README reused — needs fixed asset system (readme, thank you card, contact)
            TODO: Shared Assets Saved — needs asset reuse tracking
          */}
        </div>
      </div>

      {/* Quick action */}
      <div className="mt-8 border-t border-white/10 pt-6">
        <Link
          href="/app/factory"
          className={cn(buttonVariants({ variant: 'secondary' }), '!inline-block h-auto rounded-none border-violet-400/40 bg-violet-950/25 px-5 py-2.5 font-mono font-normal text-violet-100 transition-colors hover:bg-violet-900/35')}
        >
          Open Factory →
        </Link>
      </div>
    </div>
  )
}
