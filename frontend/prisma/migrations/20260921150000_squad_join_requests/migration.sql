-- Player self-registration & squad join requests (SELF_REGISTRATION_PLAN.md).
-- Fully additive: SQUAD_JOIN_REQUEST is a new table, and Squad.open_for_open_slot is a new
-- column with a default, so no backfill is needed. Default FALSE means no existing squad starts
-- accepting join requests until its own admin opts in.
--
-- Note there is deliberately no unique index on (squad_id, email): the real rule is "at most one
-- PENDING row per (squad_id, email)", which MySQL can't express as a partial/filtered unique
-- index. It's enforced application-side inside the same transaction as the insert
-- (lib/joinRequests.ts), the same way SlotReplacement's overlap rule is.

-- AlterTable
ALTER TABLE `Squad` ADD COLUMN `open_for_open_slot` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `SQUAD_JOIN_REQUEST` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `squad_id` INTEGER NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `name` VARCHAR(32) NOT NULL,
    `message` VARCHAR(500) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN') NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decided_at` DATETIME(3) NULL,
    `decided_by_email` VARCHAR(255) NULL,
    `created_player_id` INTEGER NULL,

    INDEX `SQUAD_JOIN_REQUEST_squad_id_status_idx`(`squad_id`, `status`),
    INDEX `SQUAD_JOIN_REQUEST_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SQUAD_JOIN_REQUEST` ADD CONSTRAINT `SQUAD_JOIN_REQUEST_squad_id_fkey` FOREIGN KEY (`squad_id`) REFERENCES `Squad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
