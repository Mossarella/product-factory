import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Nodemailer from 'next-auth/providers/nodemailer'
import { storeDevLoginUrl } from '@/lib/dev-auth'
import { prisma } from '@/lib/db'
import authConfig from './auth.config'

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
  ...authConfig,
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
})
