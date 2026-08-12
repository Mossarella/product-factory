import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Nodemailer from 'next-auth/providers/nodemailer'
import { storeDevLoginUrl } from '@/lib/dev-auth'
import { prisma } from '@/lib/db'

const smtpPort = Number(process.env.SMTP_PORT || '587')
const smtpSecure = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE === 'true'
  : smtpPort === 465
const smtpServer = {
  host: process.env.SMTP_HOST || 'localhost',
  port: smtpPort,
  secure: smtpSecure,
  ...(process.env.SMTP_USER && process.env.SMTP_PASSWORD
    ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
    : {}),
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Nodemailer({
      server: smtpServer,
      from: process.env.AUTH_EMAIL_FROM ?? 'Product Factory <noreply@localhost>',
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
    jwt({ token, user, trigger, session }) {
      if (user) token.sub = user.id
      if (trigger === 'update' && session) {
        if (typeof session.name === 'string') token.name = session.name
        if (typeof session.image === 'string') token.picture = session.image
        if (typeof session.shopName === 'string') token.shopName = session.shopName
        if (typeof session.shopContact === 'string') token.shopContact = session.shopContact
        if (typeof session.shopDescription === 'string') token.shopDescription = session.shopDescription
        if (typeof session.readmeFooter === 'string') token.readmeFooter = session.readmeFooter
      }
      return token
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
        session.user.name = (token.name as string | null) ?? session.user.name
        session.user.image = (token.picture as string | null) ?? null
        session.user.shopName = (token.shopName as string | null) ?? null
        session.user.shopContact = (token.shopContact as string | null) ?? null
        session.user.shopDescription = (token.shopDescription as string | null) ?? null
        session.user.readmeFooter = (token.readmeFooter as string | null) ?? null
      }
      return session
    },
  },
})
