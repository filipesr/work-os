-- CreateEnum
CREATE TYPE "ArtifactMediaType" AS ENUM ('VIDEOS', 'FOTOS', 'DOCUMENTOS', 'LOGOS', 'SOCIAL_MEDIA', 'OUTROS');

-- CreateEnum
CREATE TYPE "ArtifactTarget" AS ENUM ('CAMPANHA', 'INSTITUCIONAL');

-- CreateEnum
CREATE TYPE "ArtifactStorageKind" AS ENUM ('LINK', 'NAS_UPLOAD');

-- CreateEnum
CREATE TYPE "ArtifactUploadStatus" AS ENUM ('PENDING', 'UPLOADING', 'READY', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SensitivityLevel" AS ENUM ('INTERNO', 'CLIENTE', 'CONFIDENCIAL');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "folderName" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "campaignMonth" INTEGER,
ADD COLUMN     "campaignSlug" TEXT,
ADD COLUMN     "campaignYear" INTEGER,
ADD COLUMN     "nasMetadataReviewedAt" TIMESTAMP(3),
ADD COLUMN     "nasMetadataReviewedById" TEXT,
ADD COLUMN     "nasUploadEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TaskArtifact" ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "deleteRequestedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "failedReason" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "mediaType" "ArtifactMediaType",
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "nasPath" TEXT,
ADD COLUMN     "originalFileName" TEXT,
ADD COLUMN     "purposeId" TEXT,
ADD COLUMN     "readyAt" TIMESTAMP(3),
ADD COLUMN     "sensitivity" "SensitivityLevel" NOT NULL DEFAULT 'INTERNO',
ADD COLUMN     "sizeBytes" BIGINT,
ADD COLUMN     "stageId" TEXT,
ADD COLUMN     "storageKind" "ArtifactStorageKind" NOT NULL DEFAULT 'LINK',
ADD COLUMN     "target" "ArtifactTarget" NOT NULL DEFAULT 'CAMPANHA',
ADD COLUMN     "uploadStatus" "ArtifactUploadStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN     "uploadedById" TEXT,
ADD COLUMN     "version" INTEGER,
ALTER COLUMN "url" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TemplateStage" ADD COLUMN     "defaultMediaType" "ArtifactMediaType";

-- CreateTable
CREATE TABLE "DeliverablePurpose" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DeliverablePurpose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtifactShareLink" (
    "id" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "passwordHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxDownloads" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "lastDownloadedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdByIp" TEXT,
    "revokedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtifactShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtifactAuditLog" (
    "id" TEXT NOT NULL,
    "artifactId" TEXT,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtifactAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliverablePurpose_slug_key" ON "DeliverablePurpose"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ArtifactShareLink_publicId_key" ON "ArtifactShareLink"("publicId");

-- CreateIndex
CREATE INDEX "ArtifactShareLink_artifactId_idx" ON "ArtifactShareLink"("artifactId");

-- CreateIndex
CREATE INDEX "ArtifactAuditLog_artifactId_idx" ON "ArtifactAuditLog"("artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_folderName_key" ON "Client"("folderName");

-- CreateIndex
CREATE UNIQUE INDEX "TaskArtifact_nasPath_key" ON "TaskArtifact"("nasPath");

-- CreateIndex
CREATE INDEX "TaskArtifact_taskId_idx" ON "TaskArtifact"("taskId");

-- CreateIndex
CREATE INDEX "TaskArtifact_uploadStatus_idx" ON "TaskArtifact"("uploadStatus");

-- CreateIndex
CREATE UNIQUE INDEX "TaskArtifact_taskId_purposeId_mediaType_version_key" ON "TaskArtifact"("taskId", "purposeId", "mediaType", "version");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_nasMetadataReviewedById_fkey" FOREIGN KEY ("nasMetadataReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TaskArtifact" ADD CONSTRAINT "TaskArtifact_purposeId_fkey" FOREIGN KEY ("purposeId") REFERENCES "DeliverablePurpose"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TaskArtifact" ADD CONSTRAINT "TaskArtifact_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TemplateStage"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TaskArtifact" ADD CONSTRAINT "TaskArtifact_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TaskArtifact" ADD CONSTRAINT "TaskArtifact_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ArtifactShareLink" ADD CONSTRAINT "ArtifactShareLink_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "TaskArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactShareLink" ADD CONSTRAINT "ArtifactShareLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ArtifactAuditLog" ADD CONSTRAINT "ArtifactAuditLog_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "TaskArtifact"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ArtifactAuditLog" ADD CONSTRAINT "ArtifactAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

