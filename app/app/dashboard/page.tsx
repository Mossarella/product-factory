import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PRODUCT_FILES_BUCKET, productStoragePath } from '@/lib/supabase/storage'
import Link from 'next/link'
import { greeting, formatDate } from '@/lib/utils'
import { computeStats } from '@/lib/dashboard-stats'
import { aggregateDashboardEvents } from '@/lib/dashboard-events'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/cn'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: productRows, error: productsError } = await supabase.from('products').select('id, name, complete, description, etsy_title, etsy_tags, created_at').eq('owner_id', user.id).order('created_at', { ascending: false })
  if (productsError) throw new Error(productsError.message)
  const rows = productRows ?? []
  const productIds = rows.map((product) => product.id)
  const { data: fileRows, error: filesError } = productIds.length
    ? await supabase.from('product_files').select('id, product_id, original_name').eq('owner_id', user.id).in('product_id', productIds)
    : { data: [], error: null }
  if (filesError) throw new Error(filesError.message)
  const { data: eventRows, error: eventsError } = await supabase.from('product_events').select('event_type, created_at, metadata').eq('owner_id', user.id).in('event_type', ['package_created', 'asset_reused']).order('created_at', { ascending: false })
  if (eventsError) throw new Error(eventsError.message)
  const { productsPackaged, filesReused, lastExport } = aggregateDashboardEvents((eventRows ?? []).map((event) => ({
    eventType: event.event_type as 'package_created' | 'asset_reused',
    createdAt: event.created_at,
    metadata: (event.metadata ?? {}) as Record<string, unknown>,
  })))

  const products = rows.map((product) => ({
    id: product.id,
    name: product.name,
    complete: product.complete,
    description: product.description,
    etsyTitle: product.etsy_title,
    etsyTags: product.etsy_tags,
    createdAt: product.created_at,
    files: (fileRows ?? []).filter((file) => file.product_id === product.id).map((file) => ({ id: file.id, origName: file.original_name })),
  }))
  const { total, readyToPublish, needsReview, missingHero, needReadme, thisMonth, noGifPreview, sharedTags } = await computeStats(products, async (product) => {
    const { data: object } = await supabase.storage.from(PRODUCT_FILES_BUCKET).download(productStoragePath(user.id, product.id, 'etsy-slots', 'etsy-hero'))
    return !object
  })

  const stats = [
    { label: 'Total Products', value: total, color: 'text-zinc-100' },
    { label: 'Ready to Publish', value: readyToPublish, color: 'text-emerald-400' },
    { label: 'Needs Review', value: needsReview, color: 'text-amber-400' },
    { label: 'Missing Hero', value: missingHero, color: missingHero > 0 ? 'text-red-400' : 'text-zinc-500' },
    { label: 'Need README', value: needReadme, color: needReadme > 0 ? 'text-red-400' : 'text-zinc-500' },
    { label: 'Products Packaged', value: productsPackaged, color: 'text-violet-300' },
    { label: 'Files Reused', value: filesReused, color: 'text-cyan-300' },
    { label: 'Last Export', value: lastExport ? new Date(lastExport).toLocaleDateString() : 'Never', color: lastExport ? 'text-zinc-100' : 'text-zinc-600' },
  ]

  return (
    <div className="min-h-screen max-w-6xl p-5 sm:p-8">
      {/* Greeting */}
      <div className="mb-8 border-b border-white/10 pb-6">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.28em] text-violet-300/70"><span className="h-1.5 w-1.5 bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,.9)]" /> Command deck / overview</div>
        <h1 className="text-3xl font-black uppercase tracking-tight text-zinc-100 font-mono">
          {greeting(user.user_metadata?.full_name || user.email || 'Operator')}
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

          <Card className="gap-0 rounded-none border-white/10 bg-zinc-900/55 px-4 !py-4 ring-1 ring-inset ring-violet-400/5 sm:px-5 sm:!py-5">
            <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">Last Package</p>
            <p className="text-lg font-bold font-mono text-zinc-100">{lastExport ? new Date(lastExport).toLocaleDateString() : 'Never'}</p>
            <p className="text-xs text-zinc-600 font-mono mt-2">successful package event</p>
          </Card>

          <Card className="gap-0 rounded-none border-white/10 bg-zinc-900/55 px-4 !py-4 ring-1 ring-inset ring-violet-400/5 sm:px-5 sm:!py-5">
            <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">Assets Reused</p>
            <p className="text-4xl font-bold font-mono text-cyan-300">{filesReused}</p>
            <p className="text-xs text-zinc-600 font-mono mt-2">fixed assets included in packages</p>
          </Card>
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
