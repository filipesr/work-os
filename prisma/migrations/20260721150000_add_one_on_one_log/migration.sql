-- P3.11: 1:1 log — records manager↔member 1:1s to power the cadence signal
-- (days since last 1:1 per person → overdue flag).

CREATE TABLE "OneOnOneLog" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,

    CONSTRAINT "OneOnOneLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OneOnOneLog_userId_occurredAt_idx" ON "OneOnOneLog"("userId", "occurredAt");

ALTER TABLE "OneOnOneLog" ADD CONSTRAINT "OneOnOneLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OneOnOneLog" ADD CONSTRAINT "OneOnOneLog_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
