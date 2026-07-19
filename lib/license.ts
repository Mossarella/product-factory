import { prisma } from '@/lib/db'

export async function getUserLicense(userId: string): Promise<{ plan: 'free' | 'pro'; activatedAt?: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, licenseActivatedAt: true } })
  return {
    plan: (user?.plan as 'free' | 'pro') ?? 'free',
    activatedAt: user?.licenseActivatedAt?.toISOString(),
  }
}
