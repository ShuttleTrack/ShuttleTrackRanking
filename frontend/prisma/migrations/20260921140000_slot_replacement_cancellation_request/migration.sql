-- Admin-approved early cancellation for SlotReplacement: ending a replacement early (outright or
-- by shortening) now records a pending request instead of applying immediately - an admin
-- approves or rejects it (see lib/replacements.ts). Purely additive/nullable, no backfill needed.

-- AlterTable
ALTER TABLE `SLOT_REPLACEMENT` ADD COLUMN `cancellation_requested_at` DATETIME(3) NULL,
    ADD COLUMN `cancellation_requested_end_date` DATE NULL;
