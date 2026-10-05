-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractVersion" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "rawText" TEXT NOT NULL,
    "policyText" TEXT,
    "pageCount" INTEGER,
    "fileType" TEXT NOT NULL DEFAULT 'text',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSection" (
    "id" TEXT NOT NULL,
    "contractVersionId" TEXT NOT NULL,
    "sectionIndex" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "heading" TEXT,
    "text" TEXT NOT NULL,
    "page" INTEGER,
    "charStart" INTEGER NOT NULL,
    "charEnd" INTEGER NOT NULL,
    "documentType" TEXT NOT NULL DEFAULT 'contract',

    CONSTRAINT "DocumentSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedItem" (
    "id" TEXT NOT NULL,
    "contractVersionId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "uncertaintyReason" TEXT,
    "sourceSectionLabel" TEXT NOT NULL,
    "sourceSectionId" TEXT,
    "page" INTEGER,
    "exactQuote" TEXT NOT NULL,
    "citationVerified" BOOLEAN NOT NULL DEFAULT true,
    "citationWarning" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "userEdited" BOOLEAN NOT NULL DEFAULT false,
    "originalValue" TEXT NOT NULL,
    "currentValue" TEXT NOT NULL,
    "staleReason" TEXT,
    "calculatedDate" TEXT,
    "manualDateOverride" TEXT,
    "dateResolutionStatus" TEXT NOT NULL DEFAULT 'not_applicable',
    "dateResolutionReason" TEXT,
    "dateSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "contractVersionId" TEXT NOT NULL,
    "itemId" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'local user',
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewedSummary" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractVersionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "contractTitle" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isOutdated" BOOLEAN NOT NULL DEFAULT false,
    "markdownContent" TEXT NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "dataJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewedSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentSection_contractVersionId_idx" ON "DocumentSection"("contractVersionId");

-- CreateIndex
CREATE INDEX "ExtractedItem_contractVersionId_idx" ON "ExtractedItem"("contractVersionId");

-- CreateIndex
CREATE INDEX "ExtractedItem_itemType_idx" ON "ExtractedItem"("itemType");

-- CreateIndex
CREATE INDEX "ExtractedItem_reviewStatus_idx" ON "ExtractedItem"("reviewStatus");

-- CreateIndex
CREATE INDEX "AuditLog_contractVersionId_idx" ON "AuditLog"("contractVersionId");

-- CreateIndex
CREATE INDEX "ReviewedSummary_contractId_idx" ON "ReviewedSummary"("contractId");

-- CreateIndex
CREATE INDEX "ReviewedSummary_contractVersionId_idx" ON "ReviewedSummary"("contractVersionId");

-- AddForeignKey
ALTER TABLE "ContractVersion" ADD CONSTRAINT "ContractVersion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSection" ADD CONSTRAINT "DocumentSection_contractVersionId_fkey" FOREIGN KEY ("contractVersionId") REFERENCES "ContractVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedItem" ADD CONSTRAINT "ExtractedItem_contractVersionId_fkey" FOREIGN KEY ("contractVersionId") REFERENCES "ContractVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_contractVersionId_fkey" FOREIGN KEY ("contractVersionId") REFERENCES "ContractVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewedSummary" ADD CONSTRAINT "ReviewedSummary_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewedSummary" ADD CONSTRAINT "ReviewedSummary_contractVersionId_fkey" FOREIGN KEY ("contractVersionId") REFERENCES "ContractVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
