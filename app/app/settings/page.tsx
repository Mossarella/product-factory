'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/cn'
import { MAX_AVATAR_BYTES, avatarColor, getInitials } from '@/lib/utils'

export default function SettingsPage() {
  const { data: session, update } = useSession()
  const [name, setName] = useState(session?.user?.name ?? '')
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
    fetch('/api/profile').then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!data) return
      setShopName(data.shopName ?? '')
      setShopContact(data.shopContact ?? '')
      setShopDescription(data.shopDescription ?? '')
      setReadmeFooter(data.readmeFooter ?? '')
    })
  }, [])

  const email = session?.user?.email ?? null
  const image = session?.user?.image ?? null

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
      await update({ name: trimmed })
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
      await update({ shopName, shopContact, shopDescription, readmeFooter })
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
      await update({ image: data.image })
    } else {
      const body = await res.json().catch(() => ({}))
      setAvatarError(body.error || 'Could not upload image')
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-mono font-bold text-zinc-100">Settings</h1>
        <p className="text-zinc-500 text-sm mt-1">Your profile and account details.</p>
      </div>

      <Card className="gap-4 px-4 py-4 font-mono ring-zinc-800">
        <h2 className="text-xs text-zinc-600 uppercase tracking-widest">Profile</h2>

        <div className="flex items-center gap-4">
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
          <div className="flex items-center gap-2">
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

      <Card className="gap-4 px-4 py-4 font-mono ring-zinc-800">
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
        <div className="flex items-center gap-2">
          <Button type="button" variant="default" disabled={shopSaving} onClick={() => void saveShopProfile()}>
            {shopSaving ? 'Saving…' : 'Save'}
          </Button>
          {shopSaveFlash && <span className="text-xs text-emerald-400">Saved!</span>}
        </div>
      </Card>
    </div>
  )
}
