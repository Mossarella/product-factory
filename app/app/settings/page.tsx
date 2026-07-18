'use client'

import { useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/cn'
import { avatarColor, getInitials } from '@/lib/utils'

export default function SettingsPage() {
  const { data: session, update } = useSession()
  const [name, setName] = useState(session?.user?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [saveFlash, setSaveFlash] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

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

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const res = await fetch('/api/profile/avatar', {
      method: 'POST',
      headers: { 'X-Filename': file.name },
      body: file,
    })
    if (res.ok) {
      const data = await res.json() as { image: string }
      await update({ image: data.image })
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
    </div>
  )
}
