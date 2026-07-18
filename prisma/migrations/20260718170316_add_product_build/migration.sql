-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "buildVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProductBuild" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "manifest" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductBuild_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductBuild_productId_idx" ON "ProductBuild"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductBuild_productId_version_key" ON "ProductBuild"("productId", "version");

-- AddForeignKey
ALTER TABLE "ProductBuild" ADD CONSTRAINT "ProductBuild_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
