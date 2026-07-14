import { prisma } from "@/lib/prisma";

let ensurePromise: Promise<void> | null = null;

export function ensureProjectSchema() {
  ensurePromise ??= (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Project" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "audioKey" TEXT,
        "audioUrl" TEXT NOT NULL,
        "audioName" TEXT,
        "audioSize" INTEGER,
        "audioType" TEXT,
        "duration" DOUBLE PRECISION,
        "bpm" DOUBLE PRECISION,
        "key" TEXT,
        "mode" TEXT,
        "stylePrompt" TEXT,
        "midiNotes" JSONB,
        "settings" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt")
    `);

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_userId_fkey') THEN
          ALTER TABLE "Project"
            ADD CONSTRAINT "Project_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Generation') THEN
          ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Generation_projectId_fkey') THEN
            ALTER TABLE "Generation"
              ADD CONSTRAINT "Generation_projectId_fkey"
              FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
        END IF;
      END $$
    `);
  })();

  return ensurePromise;
}
