'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/cn'
import { MAX_AVATAR_BYTES, avatarColor, getInitials } from '@/lib/utils'

export default function SettingsPage() {
  const [user, setUser] = useState<{ email?: string | null; user_metadata?: { full_name?: string | null } } | null>(null)
  const [name, setName] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveFlash, setSaveFlash] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [shopName, setShopName] = useState('')
  const [shopContact, setShopContact] = useState('')
  const [shopDescription, setShopDescription] = useState('')
  const [readmeFooter, setReadmeFooter] = useState('')
  const [shopSaving, setShopSaving] = useState(false)
  const [shopSaveFlash, setShopSaveFlash] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const supabase = createClient()
    void Promise.all([
      supabase.auth.getUser(),
      fetch('/api/profile').then((r) => (r.ok ? r.json() : null)),
    ]).then(([authResult, data]) => {
      const nextUser = authResult.data.user
      setUser(nextUser ? { email: nextUser.email, user_metadata: nextUser.user_metadata } : null)
      if (!data) return
      setName(data.name ?? nextUser?.user_metadata?.full_name ?? '')
      setShopName(data.shopName ?? '')
      setShopContact(data.shopContact ?? '')
      setShopDescription(data.shopDescription ?? '')
      setReadmeFooter(data.readmeFooter ?? '')
    })
  }, [])

  const email = user?.email ?? null

  async function saveName() {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    if (res.ok) {
      setName(trimmed)
      setSaveFlash(true)
      setTimeout(() => setSaveFlash(false), 2000)
    }
    setSaving(false)
  }

  async function saveShopProfile() {
    setShopSaving(true)
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, shopName, shopContact, shopDescription, readmeFooter }),
    })
    if (res.ok) {
      setShopName(shopName)
      setShopSaveFlash(true)
      setTimeout(() => setShopSaveFlash(false), 2000)
    }
    setShopSaving(false)
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setAvatarError(null)
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError('Image must be 5MB or smaller.')
      return
    }
    const res = await fetch('/api/profile/avatar', {
      method: 'POST',
      headers: { 'X-Filename': file.name },
      body: file,
    })
    if (res.ok) {
      const data = await res.json() as { image: string }
      setImage(data.image)
    } else {
      const body = await res.json().catch(() => ({}))
      setAvatarError(body.error || 'Could not upload image')
    }
  }

  return (
    <div className="min-h-screen max-w-3xl p-5 sm:p-8">
      <div className="mb-8 border-b border-white/10 pb-6">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.28em] text-violet-300/70"><span className="h-1.5 w-1.5 bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,.9)]" /> System / profile</div>
        <h1 className="text-2xl font-black uppercase tracking-tight text-zinc-100 font-mono">Settings</h1>
        <p className="mt-1 text-xs font-mono text-zinc-500">Your profile and account details.</p>
      </div>

      <Card className="mb-5 gap-4 border-white/10 bg-zinc-900/45 px-4 py-4 font-mono ring-1 ring-inset ring-violet-400/5">
        <h2 className="text-xs text-zinc-600 uppercase tracking-widest">Profile</h2>

        <div className="flex flex-wrap items-center gap-4">
          <Avatar className="h-16 w-16">
            {image && <AvatarImage src={image} alt="" />}
            <AvatarFallback className={cn('text-lg text-white', avatarColor(name || email || 'user'))}>
              {getInitials(name, email)}
            </AvatarFallback>
          </Avatar>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
            Upload image
          </Button>
        </div>
        {avatarError && <p className="text-xs text-red-400">{avatarError}</p>}

        <div>
          <Label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Display name</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
            <Button type="button" variant="default" disabled={saving} onClick={() => void saveName()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {saveFlash && <span className="text-xs text-emerald-400">Saved!</span>}
          </div>
        </div>

        <div>
          <Label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Email</Label>
          <p className="text-sm text-zinc-300">{email ?? '—'}</p>
        </div>
      </Card>

      <Card className="mb-5 gap-4 border-white/10 bg-zinc-900/45 px-4 py-4 font-mono ring-1 ring-inset ring-violet-400/5">
        <h2 className="text-xs text-zinc-600 uppercase tracking-widest">Shop Profile</h2>
        <p className="text-xs text-zinc-500">
          Used in your generated READMEs and Etsy listings. Leave blank to use a generic default.
        </p>
        <div>
          <Label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Shop name</Label>
          <Input value={shopName} onChange={(e) => setShopName(e.target.value)} className="max-w-xs" placeholder={name || 'My Shop'} />
        </div>
        <div>
          <Label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Contact info</Label>
          <Input value={shopContact} onChange={(e) => setShopContact(e.target.value)} className="max-w-xs" placeholder="etsy.com/shop/yourshop" />
        </div>
        <div>
          <Label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Default product description</Label>
          <Input value={shopDescription} onChange={(e) => setShopDescription(e.target.value)} placeholder="A handcrafted digital product made with love." />
        </div>
        <div>
          <Label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">README footer / license note</Label>
          <Input value={readmeFooter} onChange={(e) => setReadmeFooter(e.target.value)} placeholder="Personal and commercial use allowed with credit. Do not redistribute." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="default" disabled={shopSaving} onClick={() => void saveShopProfile()}>
            {shopSaving ? 'Saving…' : 'Save'}
          </Button>
          {shopSaveFlash && <span className="text-xs text-emerald-400">Saved!</span>}
        </div>
      </Card>
    </div>
  )
}
