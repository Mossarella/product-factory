import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { SAMPLE_PRODUCTS } from '@/lib/sample-products'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const userId = session.user.id
    let created = 0
    let existing = 0

    // Sample loading is an explicit demo action, so it intentionally bypasses
    // the normal free-plan product limit and remains safe to repeat.
    await prisma.$transaction(async (tx) => {
      for (const sample of SAMPLE_PRODUCTS) {
        const product = await tx.product.findUnique({
          where: { userId_name: { userId, name: sample.name } },
          select: { id: true },
        })

        await tx.product.upsert({
          where: { userId_name: { userId, name: sample.name } },
          update: {
            sku: sample.sku,
            productName: sample.productName,
            etsyTitle: sample.etsyTitle,
            description: sample.description,
            notes: sample.notes,
            contact: sample.contact,
            price: sample.price,
            currency: sample.currency,
            licenseType: sample.licenseType,
            commercialPrice: sample.commercialPrice ?? null,
            folders: sample.folders,
            etsyTags: sample.etsyTags,
          },
          create: {
            userId,
            name: sample.name,
            sku: sample.sku,
            productName: sample.productName,
            etsyTitle: sample.etsyTitle,
            description: sample.description,
            notes: sample.notes,
            contact: sample.contact,
            price: sample.price,
            currency: sample.currency,
            licenseType: sample.licenseType,
            commercialPrice: sample.commercialPrice ?? null,
            folders: sample.folders,
            etsyTags: sample.etsyTags,
            complete: false,
          },
          select: { id: true },
        })

        if (product) existing += 1
        else created += 1
      }
    })

    return NextResponse.json({
      created,
      existing,
      products: SAMPLE_PRODUCTS.map((sample) => sample.name),
    })
  } catch (error) {
    console.error('[sample-products] failed to load sample collection', error)
    return NextResponse.json({ error: 'Could not load the sample collection' }, { status: 500 })
  }
}
