-- Join requests carry the player type the requester asked for (open slot or full-time).
-- Additive with a default: every existing row was filed against the open-slot-only flow, so
-- OPEN_SLOT is the correct backfill and no UPDATE is needed.

-- AlterTable
ALTER TABLE `SQUAD_JOIN_REQUEST` ADD COLUMN `requested_player_type` ENUM('FULLTIME', 'OPEN_SLOT') NOT NULL DEFAULT 'OPEN_SLOT';
