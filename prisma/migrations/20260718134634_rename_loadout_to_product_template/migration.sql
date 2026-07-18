-- Rename Loadout table to ProductTemplate (lossless: preserves existing rows)
ALTER TABLE "Loadout" RENAME TO "ProductTemplate";

-- Rename constraints/indexes to match (Postgres does not auto-rename these on table rename)
ALTER TABLE "ProductTemplate" RENAME CONSTRAINT "Loadout_pkey" TO "ProductTemplate_pkey";
ALTER TABLE "ProductTemplate" RENAME CONSTRAINT "Loadout_userId_fkey" TO "ProductTemplate_userId_fkey";
ALTER INDEX "Loadout_userId_idx" RENAME TO "ProductTemplate_userId_idx";

-- Add the new rules column
ALTER TABLE "ProductTemplate" ADD COLUMN "rules" JSONB NOT NULL DEFAULT '[]';

-- Rename Product.loadoutId -> Product.templateId
ALTER TABLE "Product" RENAME COLUMN "loadoutId" TO "templateId";
ALTER TABLE "Product" RENAME CONSTRAINT "Product_loadoutId_fkey" TO "Product_templateId_fkey";
