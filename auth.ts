import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Resend from 'next-auth/providers/resend'
import { storeDevLoginUrl } from '@/lib/dev-auth'
import { prisma } from '@/lib/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY ?? 'dev-placeholder',
      from: process.env.AUTH_EMAIL_FROM ?? 'Product Factory <noreply@resend.dev>',
      // In dev mode, skip actually sending the email — the VerificationToken is
      // already written to the DB before this runs, so the dev bypass works.
      ...(process.env.NODE_ENV !== 'production' && {
        sendVerificationRequest({ url, identifier, expires }) {
          console.log(`[DEV] Magic link for ${identifier}: ${url}`)
          storeDevLoginUrl(identifier, url, expires)
        },
      }),
    }),
  ],
  pages: {
    signIn: '/login',
    verifyRequest: '/login?check-email=1',
  },
  session: {
    // JWT sessions work in Edge middleware; database sessions require Prisma on Edge.
    strategy: 'jwt',
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.sub = user.id
      return token
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
      }
      return session
    },
  },
})
