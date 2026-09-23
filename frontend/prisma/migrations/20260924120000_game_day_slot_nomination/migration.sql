-- One-day slot nominations (SINGLE_DAY_NOMINATION_PLAN.md). Additive: one new table, no backfill.

-- CreateTable
CREATE TABLE `GAME_DAY_SLOT_NOMINATION` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `game_day_id` INTEGER NOT NULL,
    `nominator_player_id` INTEGER NOT NULL,
    `nominee_player_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ended_at` DATETIME(3) NULL,
    `end_reason` ENUM('REVOKED', 'SWITCHED', 'NOMINATOR_OUT', 'ADMIN_RELEASE', 'PLAYER_DISABLED', 'GAME_DAY_CANCELLED', 'SESSION_ENDED') NULL,
    `announced_at` DATETIME(3) NULL,
    `retracted_at` DATETIME(3) NULL,

    INDEX `GAME_DAY_SLOT_NOMINATION_game_day_id_ended_at_idx`(`game_day_id`, `ended_at`),
    INDEX `GAME_DAY_SLOT_NOMINATION_nominator_player_id_idx`(`nominator_player_id`),
    INDEX `GAME_DAY_SLOT_NOMINATION_nominee_player_id_idx`(`nominee_player_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GAME_DAY_SLOT_NOMINATION` ADD CONSTRAINT `GAME_DAY_SLOT_NOMINATION_game_day_id_fkey` FOREIGN KEY (`game_day_id`) REFERENCES `GAME_DAY`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GAME_DAY_SLOT_NOMINATION` ADD CONSTRAINT `GAME_DAY_SLOT_NOMINATION_nominator_player_id_fkey` FOREIGN KEY (`nominator_player_id`) REFERENCES `PLAYER`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GAME_DAY_SLOT_NOMINATION` ADD CONSTRAINT `GAME_DAY_SLOT_NOMINATION_nominee_player_id_fkey` FOREIGN KEY (`nominee_player_id`) REFERENCES `PLAYER`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
