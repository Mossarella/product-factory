'use client'

import { useEffect, useState } from 'react'

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

  useEffect(() => {
    fetch('/api/loadouts')
      .then(r => r.json())
      .then((data: Loadout[]) => {
        setLoadouts(data)
        if (data.length > 0) select(data[0])
      })
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

  const selected = loadouts.find(l => l.id === selectedId)

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100 font-mono">Fixed Asset Loadouts</h1>
        <p className="text-zinc-500 text-sm mt-1 font-mono">Preset bundles of files attached to each product.</p>
      </div>

      <div className="flex gap-6 h-[calc(100vh-200px)]">
        {/* Left — loadout list */}
        <div className="w-52 shrink-0 flex flex-col gap-1">
          <button
            onClick={createLoadout}
            className="w-full border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-500 hover:border-violet-600 hover:text-violet-400 font-mono transition-colors mb-2"
          >
            + New Loadout
          </button>
          {loadouts.length === 0 && (
            <p className="text-xs text-zinc-600 font-mono px-1">No loadouts yet.</p>
          )}
          {loadouts.map(l => (
            <button
              key={l.id}
              onClick={() => select(l)}
              className={`w-full text-left px-3 py-2 text-sm font-mono transition-colors border-l-2 ${
                l.id === selectedId
                  ? 'border-violet-500 bg-zinc-800/60 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40'
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>

        {/* Right — editor */}
        {selected ? (
          <div className="flex-1 border border-zinc-800 bg-zinc-900/40 p-6">
            {/* Name */}
            <div className="mb-6">
              <label className="block text-xs uppercase tracking-widest text-zinc-600 font-mono mb-2">Loadout name</label>
              <input
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
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={save}
                disabled={saving}
                className="border border-violet-600 bg-violet-600 px-4 py-2 text-sm text-zinc-100 hover:bg-violet-500 disabled:opacity-50 font-mono transition-colors"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                onClick={deleteLoadout}
                className="border border-zinc-700 px-4 py-2 text-sm text-zinc-500 hover:border-red-700 hover:text-red-400 font-mono transition-colors"
              >
                Delete loadout
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 border border-dashed border-zinc-800 flex items-center justify-center">
            <p className="text-zinc-600 font-mono text-sm">No loadouts yet. Create one to get started.</p>
          </div>
        )}
      </div>
    </div>
  )
}
