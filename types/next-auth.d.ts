import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      shopName?: string | null
      shopContact?: string | null
      shopDescription?: string | null
      readmeFooter?: string | null
    } & DefaultSession['user']
  }
}
