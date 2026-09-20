-- Multi-squad tenancy, Stage 2 - Contract (SQUAD_TENANCY_PLAN.md).
--
-- Only run this once Stage 1 (001_expand.sql + the backfill in scripts/migrate-to-squads.mjs
-- stage1) is done AND `node scripts/migrate-to-squads.mjs stage2` reports clean (no player with
-- a missing/duplicate email). Every statement below assumes squad_id/squadId is already
-- populated on every row and every player's email is non-null and unique within its squad - run
-- against data that doesn't satisfy that yet and the ADD CONSTRAINT / MODIFY ... NOT NULL
-- statements will fail (which is the point: it's a safety check, not a bug).
--
-- Captured verbatim from `npx prisma migrate diff --from-url <post-stage-1 db>
-- --to-schema-datamodel prisma/schema.prisma --script` against a rehearsal copy of the real
-- production data (frontend/scripts/migrate-to-squads.mjs's header has the full rehearsal
-- notes) - these are Prisma's own generated constraint/index names, not hand-guessed, so a
-- later `prisma db push` sees the database already matches schema.prisma and does nothing.

-- DropIndex
DROP INDEX `team_uniqness` ON `ENCOUNTER`;

-- AlterTable
ALTER TABLE `ENCOUNTER` MODIFY `squad_id` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `Game` MODIFY `squadId` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `PLAYER` MODIFY `email` VARCHAR(255) NOT NULL,
    MODIFY `player_status` VARCHAR(191) NULL,
    MODIFY `squad_id` INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX `ENCOUNTER_squad_id_idx` ON `ENCOUNTER`(`squad_id`);

-- CreateIndex
CREATE UNIQUE INDEX `team_uniqness` ON `ENCOUNTER`(`squad_id`, `team_1`, `team_2`, `encounter_date`);

-- CreateIndex
CREATE INDEX `Game_squadId_idx` ON `Game`(`squadId`);

-- CreateIndex
CREATE INDEX `PLAYER_squad_id_idx` ON `PLAYER`(`squad_id`);

-- CreateIndex
CREATE UNIQUE INDEX `PLAYER_squad_id_email_key` ON `PLAYER`(`squad_id`, `email`);

-- AddForeignKey
ALTER TABLE `PLAYER` ADD CONSTRAINT `PLAYER_squad_id_fkey` FOREIGN KEY (`squad_id`) REFERENCES `Squad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ENCOUNTER` ADD CONSTRAINT `ENCOUNTER_squad_id_fkey` FOREIGN KEY (`squad_id`) REFERENCES `Squad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Game` ADD CONSTRAINT `Game_squadId_fkey` FOREIGN KEY (`squadId`) REFERENCES `Squad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SquadAdmin` ADD CONSTRAINT `SquadAdmin_squadId_fkey` FOREIGN KEY (`squadId`) REFERENCES `Squad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
