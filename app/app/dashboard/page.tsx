import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { greeting, formatDate } from '@/lib/utils'
import { heroSlotEmpty, computeStats } from '@/lib/dashboard-stats'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const products = await prisma.product.findMany({
    where: { userId },
    select: {
      name: true,
      complete: true,
      description: true,
      etsyTitle: true,
      etsyTags: true,
      createdAt: true,
      files: { select: { id: true, origName: true } },
    },
  })

  const { total, readyToPublish, needsReview, missingHero, needReadme, thisMonth, noGifPreview, sharedTags } = computeStats(products, userId)

  const stats = [
    { label: 'Total Products', value: total, color: 'text-zinc-100' },
    { label: 'Ready to Publish', value: readyToPublish, color: 'text-emerald-400' },
    { label: 'Needs Review', value: needsReview, color: 'text-amber-400' },
    { label: 'Missing Hero', value: missingHero, color: missingHero > 0 ? 'text-red-400' : 'text-zinc-500' },
    { label: 'Need README', value: needReadme, color: needReadme > 0 ? 'text-red-400' : 'text-zinc-500' },
    { label: 'Last Export', value: 'Never', color: 'text-zinc-600' },
  ]

  return (
    <div className="p-8 max-w-4xl">
      {/* Greeting */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-zinc-100 font-mono">
          {greeting(session.user.name)}
        </h1>
        <p className="text-zinc-500 text-sm mt-1 font-mono">{formatDate()}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map(s => (
          <div key={s.label} className="border border-zinc-800 bg-zinc-900/60 p-5">
            <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">
              {s.label}
            </p>
            <p className={`text-4xl font-bold font-mono ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Insights */}
      <div className="mt-10">
        <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-4">Insights — This Month</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-zinc-800 bg-zinc-900/60 p-5">
            <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">This Month</p>
            <p className="text-4xl font-bold font-mono text-zinc-100">{thisMonth}</p>
            <p className="text-xs text-zinc-600 font-mono mt-2">products created</p>
          </div>

          <div className="border border-zinc-800 bg-zinc-900/60 p-5">
            <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">No GIF Preview</p>
            <p className={`text-4xl font-bold font-mono ${noGifPreview > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
              {noGifPreview}
            </p>
            <p className="text-xs text-zinc-600 font-mono mt-2">products don&apos;t contain a GIF preview</p>
          </div>

          <div className="border border-zinc-800 bg-zinc-900/60 p-5">
            <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">Identical Tags</p>
            <p className={`text-4xl font-bold font-mono ${sharedTags > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
              {sharedTags}
            </p>
            <p className="text-xs text-zinc-600 font-mono mt-2">products share identical tag sets</p>
          </div>

          {/*
            TODO: Average Export Time — needs explicit export event tracking
            TODO: README reused — needs fixed asset system (readme, thank you card, contact)
            TODO: Shared Assets Saved — needs asset reuse tracking
          */}
        </div>
      </div>

      {/* Quick action */}
      <div className="mt-8">
        <Link
          href="/app/factory"
          className="inline-block border border-violet-700 bg-violet-700/20 px-5 py-2.5 text-sm text-violet-300 hover:bg-violet-700/40 font-mono transition-colors"
        >
          Open Factory →
        </Link>
      </div>
    </div>
  )
}
