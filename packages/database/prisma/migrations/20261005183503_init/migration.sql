-- CreateEnum
CREATE TYPE "AgeBand" AS ENUM ('3-4', '5-6', '7-8', '9-10');

-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CallChannel" AS ENUM ('BROWSER', 'PHONE');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('TOP_UP', 'CALL_RESERVATION', 'CALL_CHARGE', 'CALL_REFUND', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "WalletTxStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "parent_accounts" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parent_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_profiles" (
    "id" UUID NOT NULL,
    "parentId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "ageBand" "AgeBand" NOT NULL,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en-IN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "child_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_controls" (
    "id" UUID NOT NULL,
    "parentId" UUID NOT NULL,
    "dailyLimitMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxCallMinutes" INTEGER NOT NULL DEFAULT 15,
    "allowedLanguages" TEXT[] DEFAULT ARRAY['en-IN', 'hi-IN', 'mr-IN']::TEXT[],
    "voicePaused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parent_controls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_worlds" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_worlds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" UUID NOT NULL,
    "parentId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "worldId" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "StoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_memory" (
    "id" UUID NOT NULL,
    "storyId" UUID NOT NULL,
    "state" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_episodes" (
    "id" UUID NOT NULL,
    "storyId" UUID NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "choices" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "story_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_sessions" (
    "id" UUID NOT NULL,
    "parentId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "storyId" UUID,
    "channel" "CallChannel" NOT NULL,
    "language" TEXT NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "parentId" UUID NOT NULL,
    "balancePaise" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "referenceId" TEXT,
    "idempotencyKey" TEXT,
    "status" "WalletTxStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_charges" (
    "id" UUID NOT NULL,
    "callSessionId" UUID NOT NULL,
    "reservedPaise" BIGINT NOT NULL DEFAULT 0,
    "chargedPaise" BIGINT NOT NULL DEFAULT 0,
    "refundedPaise" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "language_configs" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "speechRecognitionSupported" BOOLEAN NOT NULL DEFAULT false,
    "textGenerationSupported" BOOLEAN NOT NULL DEFAULT false,
    "speechSynthesisSupported" BOOLEAN NOT NULL DEFAULT false,
    "defaultVoice" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "language_configs_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "parent_accounts_email_key" ON "parent_accounts"("email");

-- CreateIndex
CREATE INDEX "child_profiles_parentId_idx" ON "child_profiles"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "parent_controls_parentId_key" ON "parent_controls"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "characters_slug_key" ON "characters"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "story_worlds_slug_key" ON "story_worlds"("slug");

-- CreateIndex
CREATE INDEX "stories_parentId_idx" ON "stories"("parentId");

-- CreateIndex
CREATE INDEX "stories_childId_idx" ON "stories"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "story_memory_storyId_key" ON "story_memory"("storyId");

-- CreateIndex
CREATE UNIQUE INDEX "story_episodes_storyId_episodeNumber_key" ON "story_episodes"("storyId", "episodeNumber");

-- CreateIndex
CREATE INDEX "call_sessions_parentId_createdAt_idx" ON "call_sessions"("parentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_parentId_key" ON "wallets"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotencyKey_key" ON "wallet_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "wallet_transactions_walletId_createdAt_idx" ON "wallet_transactions"("walletId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "call_charges_callSessionId_key" ON "call_charges"("callSessionId");

-- AddForeignKey
ALTER TABLE "child_profiles" ADD CONSTRAINT "child_profiles_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_controls" ADD CONSTRAINT "parent_controls_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_childId_fkey" FOREIGN KEY ("childId") REFERENCES "child_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "story_worlds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_memory" ADD CONSTRAINT "story_memory_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_episodes" ADD CONSTRAINT "story_episodes_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_childId_fkey" FOREIGN KEY ("childId") REFERENCES "child_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_charges" ADD CONSTRAINT "call_charges_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "call_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
