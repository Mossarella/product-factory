-- CreateTable
CREATE TABLE "FixedAssetFile" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "assetKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "origName" TEXT NOT NULL,

    CONSTRAINT "FixedAssetFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FixedAssetFile_productId_assetKey_key" ON "FixedAssetFile"("productId", "assetKey");

-- AddForeignKey
ALTER TABLE "FixedAssetFile" ADD CONSTRAINT "FixedAssetFile_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
