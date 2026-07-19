-- AlterTable
ALTER TABLE "User" ADD COLUMN     "licenseActivatedAt" TIMESTAMP(3),
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'free';

-- CreateTable
CREATE TABLE "LicenseKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'pro',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "usedByUserId" TEXT,

    CONSTRAINT "LicenseKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LicenseKey_key_key" ON "LicenseKey"("key");

-- CreateIndex
CREATE INDEX "LicenseKey_usedByUserId_idx" ON "LicenseKey"("usedByUserId");

-- AddForeignKey
ALTER TABLE "LicenseKey" ADD CONSTRAINT "LicenseKey_usedByUserId_fkey" FOREIGN KEY ("usedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
