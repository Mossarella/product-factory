-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "loadoutId" TEXT;

-- CreateTable
CREATE TABLE "Loadout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assets" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Loadout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Loadout_userId_idx" ON "Loadout"("userId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_loadoutId_fkey" FOREIGN KEY ("loadoutId") REFERENCES "Loadout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loadout" ADD CONSTRAINT "Loadout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
