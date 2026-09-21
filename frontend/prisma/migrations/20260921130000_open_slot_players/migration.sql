-- Open-slot & replacement players (OPEN_SLOT_PLAYERS_PLAN.md).
-- All additive: new columns have defaults, rank_score is only relaxed to nullable (no backfill
-- needed - every existing row already has a non-null value), and SLOT_REPLACEMENT is a new table.

-- AlterTable
ALTER TABLE `PLAYER` ADD COLUMN `player_type` ENUM('FULLTIME', 'OPEN_SLOT') NOT NULL DEFAULT 'FULLTIME',
    MODIFY `rank_score` DOUBLE NULL;

-- AlterTable
ALTER TABLE `Squad` ADD COLUMN `open_slot_absentee_grace_days` INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN `open_slot_visibility_game_days` INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE `SLOT_REPLACEMENT` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `squad_id` INTEGER NOT NULL,
    `fulltime_player_id` INTEGER NOT NULL,
    `replacement_player_id` INTEGER NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `created_by_email` VARCHAR(191) NOT NULL,
    `cancelled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SLOT_REPLACEMENT_squad_id_idx`(`squad_id`),
    INDEX `SLOT_REPLACEMENT_fulltime_player_id_idx`(`fulltime_player_id`),
    INDEX `SLOT_REPLACEMENT_replacement_player_id_idx`(`replacement_player_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SLOT_REPLACEMENT` ADD CONSTRAINT `SLOT_REPLACEMENT_squad_id_fkey` FOREIGN KEY (`squad_id`) REFERENCES `Squad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SLOT_REPLACEMENT` ADD CONSTRAINT `SLOT_REPLACEMENT_fulltime_player_id_fkey` FOREIGN KEY (`fulltime_player_id`) REFERENCES `PLAYER`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SLOT_REPLACEMENT` ADD CONSTRAINT `SLOT_REPLACEMENT_replacement_player_id_fkey` FOREIGN KEY (`replacement_player_id`) REFERENCES `PLAYER`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
