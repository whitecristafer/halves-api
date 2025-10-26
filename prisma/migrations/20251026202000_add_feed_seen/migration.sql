-- CreateTable
CREATE TABLE "FeedSeen" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "seenUserId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedSeen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedSeen_viewerId_seenUserId_key" ON "FeedSeen"("viewerId", "seenUserId");
CREATE INDEX "FeedSeen_viewerId_seenAt_idx" ON "FeedSeen"("viewerId", "seenAt");

-- AddForeignKey
ALTER TABLE "FeedSeen" ADD CONSTRAINT "FeedSeen_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedSeen" ADD CONSTRAINT "FeedSeen_seenUserId_fkey" FOREIGN KEY ("seenUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
