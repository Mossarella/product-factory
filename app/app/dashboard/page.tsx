import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/db'
import { PRODUCTS_DIR } from '@/lib/api-files'
import Link from 'next/link'

function heroSlotEmpty(userId: string, productName: string): boolean {
  try {
    const heroDir = path.join(PRODUCTS_DIR, userId, productName, 'assets', 'etsy-hero')
    return fs.readdirSync(heroDir).filter((f: string) => !f.startsWith('.')).length === 0
  } catch {
    return true
  }
}

function greeting(name: string | null | undefined): string {
  const hour = new Date().getHours()
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const first = name ? name.split(' ')[0] : 'there'
  return `Good ${time}, ${first}`
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

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

  const total = products.length
  const readyToPublish = products.filter(p => p.complete).length
  const needsReview = products.filter(
    p => !p.complete && (p.files.length > 0 || p.etsyTitle !== '')
  ).length
  const missingHero = products.filter(p => heroSlotEmpty(userId, p.name)).length
  const needReadme = products.filter(
    p => !p.description || p.description.trim() === ''
  ).length

  // --- Insights ---
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const thisMonth = products.filter(p => new Date(p.createdAt) >= firstOfMonth).length

  const noGifPreview = products.filter(p =>
    !p.files.some(f => f.origName.toLowerCase().endsWith('.gif'))
  ).length

  // Products sharing identical tag sets
  const tagKey = (tags: string[]) => [...tags].sort().join('|')
  const tagGroups: Record<string, number> = {}
  for (const p of products) {
    const key = tagKey(p.etsyTags)
    tagGroups[key] = (tagGroups[key] ?? 0) + 1
  }
  const sharedTags = products.filter(p => (tagGroups[tagKey(p.etsyTags)] ?? 1) > 1).length

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
