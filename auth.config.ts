import type { NextAuthConfig } from 'next-auth'

export default {
  providers: [],
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
} satisfies NextAuthConfig
