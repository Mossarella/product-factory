import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const seeds = [
    { email: 'admin@example.com', name: 'Admin' },
  ]

  for (const seed of seeds) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      update: {},
      create: {
        email: seed.email,
        name: seed.name,
        // emailVerified = now so the account is active for the dev bypass
        emailVerified: new Date(),
      },
    })
    console.log(`seeded: ${user.email} (${user.id})`)
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
