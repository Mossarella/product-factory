import { randomUUID } from 'crypto'
import { prisma } from '@/lib/db'

export async function issueKey(plan = 'pro'): Promise<string> {
  const key = randomUUID()
  await prisma.licenseKey.create({ data: { key, plan } })
  return key
}

export async function redeemKey(
  key: string,
  userId: string,
): Promise<{ plan: string; activatedAt: string } | { error: string }> {
  const record = await prisma.licenseKey.findUnique({ where: { key } })
  if (!record) return { error: 'Invalid license key' }

  if (record.usedAt) {
    if (record.usedByUserId === userId) {
      return { plan: record.plan, activatedAt: record.usedAt.toISOString() }
    }
    return { error: 'Key already activated' }
  }

  const activatedAt = new Date()
  await prisma.$transaction([
    prisma.licenseKey.update({ where: { key }, data: { usedAt: activatedAt, usedByUserId: userId } }),
    prisma.user.update({ where: { id: userId }, data: { plan: record.plan, licenseActivatedAt: activatedAt } }),
  ])
  return { plan: record.plan, activatedAt: activatedAt.toISOString() }
}
