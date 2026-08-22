'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { avatarColor, getInitials } from '@/lib/utils'
import { cn } from '@/lib/cn'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const NAV = [
  {
    href: '/app/dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    href: '/app/collection',
    label: 'Collection',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="9" y="1" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="1" y="9" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="9" y="9" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    href: '/app/factory',
    label: 'Factory',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M8 1V15M2 4.5L14 11.5M14 4.5L2 11.5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    href: '/app/product-templates',
    label: 'Product Templates',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1L14 4L8 7L2 4L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M2 8L8 11L14 8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M2 12L8 15L14 12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [profile, setProfile] = useState<{ name?: string | null; shopName?: string | null } | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null)
  useEffect(() => {
    const supabase = createClient()
    void Promise.all([supabase.auth.getUser(), fetch('/api/profile').then((response) => response.ok ? response.json() : null)]).then(([authResult, nextProfile]) => {
      setEmail(authResult.data.user?.email ?? null)
      setProfile(nextProfile)
    })
  }, [])
  const name = profile?.name ?? null
  const shopLabel = profile?.shopName || name || 'My Shop'

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-56 shrink-0 flex-col border-r border-violet-400/15 bg-zinc-950/95 shadow-[12px_0_40px_rgba(0,0,0,.22)]">
      {/* Brand */}
      <Link href="/app/dashboard" className="block border-b border-white/10 px-5 py-5 transition-colors hover:bg-violet-950/20">
        <div className="mb-2 flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.28em] text-violet-300/70"><span className="h-1.5 w-1.5 bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,.9)]" /> Virtual stockroom</div>
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-zinc-100 font-mono">Factory</p>
        <p className="text-xs text-zinc-600 font-mono mt-0.5">{shopLabel}</p>
      </Link>

      <div className="mx-3 h-px bg-white/10" />

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 border px-3 py-2.5 text-sm font-mono transition-colors ${
                active
                  ? 'border-violet-400/40 bg-violet-950/30 text-zinc-100 shadow-[inset_3px_0_0_rgba(167,139,250,.9)]'
                  : 'border-white/5 text-zinc-500 hover:border-white/15 hover:bg-white/5 hover:text-zinc-300'
              }`}
            >
              <span className="shrink-0">{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="border-t border-white/10 px-4 py-4">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2 outline-none">
            <Avatar className="h-8 w-8 shrink-0">
              {image && <AvatarImage src={image} alt="" />}
              <AvatarFallback className={cn('font-mono text-xs text-white', avatarColor(name ?? email ?? 'user'))}>
                {getInitials(name, email)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-xs text-zinc-500 font-mono">{name ?? email ?? 'Account'}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-mono text-zinc-100">{name ?? 'Account'}</p>
              <p className="truncate text-xs font-mono text-zinc-500">{email ?? 'unknown'}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/app/settings" className="font-mono text-sm" />}>
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                void createClient().auth.signOut().then(() => router.push('/'))
              }}
              className="font-mono text-sm"
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}
