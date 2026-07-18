-- AlterTable
ALTER TABLE "ProductBuild" ADD COLUMN     "changelog" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "revertedFrom" INTEGER;
