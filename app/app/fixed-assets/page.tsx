'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Loadout = { id: string; name: string; assets: string[] }

const ASSET_TYPES = [
  {
    key: 'readme',
    label: 'README',
    description: 'Text file with product info',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M8 7H16M8 11H16M8 15H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    key: 'license',
    label: 'License',
    description: 'License agreement file',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L20 6V12C20 16.4 16.4 20.4 12 22C7.6 20.4 4 16.4 4 12V6L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    key: 'thankyou',
    label: 'Thank You Card',
    description: 'THANKYOU.png bundled in ZIP',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 21C12 21 3 15 3 9C3 6.24 5.24 4 8 4C9.6 4 11 4.8 12 6C13 4.8 14.4 4 16 4C18.76 4 21 6.24 21 9C21 15 12 21 12 21Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    key: 'howto',
    label: 'How To Use',
    description: 'HOWTO.png bundled in ZIP',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M12 8C12 8 10 9 10 11C10 12.1 10.9 13 12 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="12" cy="16" r="0.75" fill="currentColor"/>
      </svg>
    ),
  },
]

export default function FixedAssetsPage() {
  const [loadouts, setLoadouts] = useState<Loadout[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAssets, setEditAssets] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [newAssetName, setNewAssetName] = useState('')
  const [addError, setAddError] = useState('')

  useEffect(() => {
    fetch('/api/loadouts')
      .then(async (r) => (r.ok ? r.json() as Promise<Loadout[]> : []))
      .then((data) => {
        setLoadouts(data)
        if (data.length > 0) select(data[0])
      })
      .catch(() => setLoadouts([]))
  }, [])

  function select(l: Loadout) {
    setSelectedId(l.id)
    setEditName(l.name)
    setEditAssets(l.assets)
  }

  async function createLoadout() {
    const res = await fetch('/api/loadouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Untitled', assets: [] }),
    })
    if (!res.ok) return
    const newL: Loadout = await res.json()
    setLoadouts(prev => [...prev, newL])
    select(newL)
  }

  async function save() {
    if (!selectedId) return
    setSaving(true)
    const res = await fetch(`/api/loadouts/${selectedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, assets: editAssets }),
    })
    if (!res.ok) {
      setSaving(false)
      return
    }
    const updated: Loadout = await res.json()
    setLoadouts(prev => prev.map(l => l.id === selectedId ? updated : l))
    setSaving(false)
  }

  async function deleteLoadout() {
    if (!selectedId) return
    await fetch(`/api/loadouts/${selectedId}`, { method: 'DELETE' })
    const next = loadouts.filter(l => l.id !== selectedId)
    setLoadouts(next)
    if (next.length > 0) select(next[0])
    else { setSelectedId(null); setEditName(''); setEditAssets([]) }
  }

  function toggleAsset(key: string) {
    setEditAssets(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  function addOtherAsset() {
    const trimmed = newAssetName.trim()
    if (!trimmed) return
    const isDuplicate = editAssets.some((key) => key.toLowerCase() === trimmed.toLowerCase())
    if (isDuplicate) {
      setAddError('Already added.')
      return
    }
    toggleAsset(trimmed)
    setNewAssetName('')
    setAddError('')
  }

  const selected = loadouts.find(l => l.id === selectedId)
  const customAssetNames = editAssets.filter((key) => !ASSET_TYPES.some((a) => a.key === key))

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100 font-mono">Fixed Asset Loadouts</h1>
        <p className="text-zinc-500 text-sm mt-1 font-mono">Preset bundles of files attached to each product.</p>
      </div>

      <div className="flex gap-6 h-[calc(100vh-200px)]">
        {/* Left — loadout list */}
        <div className="w-52 shrink-0 flex flex-col gap-1">
          <Button
            variant="outline"
            onClick={createLoadout}
            className="w-full border-dashed border-zinc-700 hover:border-violet-600 hover:text-violet-400 px-3 py-2 text-xs text-zinc-500 font-mono transition-colors mb-2"
          >
            + New Loadout
          </Button>
          {loadouts.length === 0 && (
            <p className="text-xs text-zinc-600 font-mono px-1">No loadouts yet.</p>
          )}
          <Tabs
            orientation="vertical"
            value={selectedId}
            onValueChange={(id) => {
              const l = loadouts.find(x => x.id === id)
              if (l) select(l)
            }}
          >
            <TabsList className="w-52 flex-col items-stretch bg-transparent p-0 h-fit">
              {loadouts.map(l => (
                <TabsTrigger
                  key={l.id}
                  value={l.id}
                  className="justify-start rounded-none border-transparent px-3 py-2 text-sm font-mono text-zinc-500 transition-colors hover:bg-zinc-800/40 hover:text-zinc-300 data-active:border-l-2 data-active:border-violet-500 data-active:bg-zinc-800/60 data-active:text-zinc-100 data-active:shadow-none"
                >
                  {l.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Right — editor */}
        {selected ? (
          <Card className="flex-1 bg-zinc-900/40 p-6 ring-zinc-800">
            {/* Name */}
            <div className="mb-6">
              <Label className="block text-xs uppercase tracking-widest text-zinc-600 font-mono mb-2">Loadout name</Label>
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 font-mono focus:border-violet-500 focus:outline-none w-64"
              />
            </div>

            {/* Asset grid */}
            <div className="mb-6">
              <label className="block text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">Included assets</label>
              <div className="grid grid-cols-2 gap-3 max-w-lg">
                {ASSET_TYPES.map(a => {
                  const on = editAssets.includes(a.key)
                  return (
                    <button
                      key={a.key}
                      onClick={() => toggleAsset(a.key)}
                      className={`text-left border p-4 transition-colors ${
                        on
                          ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400'
                      }`}
                    >
                      <div className="mb-2">{a.icon}</div>
                      <p className="text-sm font-bold font-mono">{a.label}</p>
                      <p className="text-xs mt-0.5 opacity-70 font-mono">{a.description}</p>
                    </button>
                  )
                })}
              </div>
              {customAssetNames.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {customAssetNames.map((name) => (
                    <Badge key={name} variant="outline" className="h-auto rounded-none border-zinc-700 bg-zinc-900 px-2 py-1 font-mono font-normal text-zinc-300">
                      <span>{name}</span>
                      <button type="button" aria-label={`Remove ${name}`} className="text-zinc-500 hover:text-red-400" onClick={() => toggleAsset(name)}>✕</button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-start gap-2">
                <Input
                  placeholder="Custom asset name"
                  value={newAssetName}
                  onChange={(e) => { setNewAssetName(e.target.value); setAddError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOtherAsset() } }}
                  className="w-56"
                />
                <Button variant="outline" onClick={addOtherAsset}>+ Add other</Button>
                {addError && <p className="mt-1 basis-full text-xs text-red-400">{addError}</p>}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="default"
                onClick={save}
                disabled={saving}
                className="border border-violet-600 bg-violet-600 px-4 py-2 text-sm text-zinc-100 hover:bg-violet-500 disabled:opacity-50 font-mono transition-colors"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
              <Button
                variant="outline"
                onClick={deleteLoadout}
                className="border border-zinc-700 px-4 py-2 text-sm text-zinc-500 hover:border-red-700 hover:text-red-400 font-mono transition-colors"
              >
                Delete loadout
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="flex-1 border border-dashed border-zinc-800 ring-0 flex items-center justify-center">
            <p className="text-zinc-600 font-mono text-sm">No loadouts yet. Create one to get started.</p>
          </Card>
        )}
      </div>
    </div>
  )
}
