-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "parentId" UUID,
    "action" TEXT NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_parentId_createdAt_idx" ON "audit_logs"("parentId", "createdAt");
