'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
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
  const { data: session } = useSession()
  const name = session?.user?.name ?? null
  const email = session?.user?.email ?? null
  const image = session?.user?.image ?? null
  const shopLabel = session?.user?.shopName || name || 'My Shop'

  return (
    <aside className="h-screen w-56 flex flex-col border-r border-zinc-800 bg-zinc-950 shrink-0 fixed left-0 top-0 z-30">
      {/* Brand */}
      <Link href="/app/dashboard" className="px-5 py-5 block hover:bg-zinc-900/40 transition-colors">
        <p className="text-sm font-bold tracking-widest uppercase text-zinc-100 font-mono">Factory</p>
        <p className="text-xs text-zinc-600 font-mono mt-0.5">{shopLabel}</p>
      </Link>

      <div className="h-px bg-zinc-800 mx-3" />

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm font-mono transition-colors ${
                active
                  ? 'border-l-2 border-violet-500 bg-zinc-800/60 text-zinc-100'
                  : 'border-l-2 border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40'
              }`}
            >
              <span className="shrink-0">{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="border-t border-zinc-800 px-5 py-4">
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
              onClick={() => signOut({ callbackUrl: '/' })}
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
