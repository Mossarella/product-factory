import { prisma } from '@/lib/db'

export async function getUserLicense(
  userId: string,
): Promise<{ plan: 'free' | 'pro'; activatedAt?: string; subscriptionStatus?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, licenseActivatedAt: true, subscriptionStatus: true },
  })
  return {
    plan: (user?.plan as 'free' | 'pro') ?? 'free',
    activatedAt: user?.licenseActivatedAt?.toISOString(),
    subscriptionStatus: user?.subscriptionStatus ?? undefined,
  }
}
