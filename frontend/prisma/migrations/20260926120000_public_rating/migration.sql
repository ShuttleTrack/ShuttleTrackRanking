-- Weighted public leaderboard. Additive: one new column with a default, two new derived tables
-- (rebuilt wholesale by lib/ranking/publicRatingRecalc.ts), no backfill in SQL.

-- AlterTable
ALTER TABLE `Squad` ADD COLUMN `public_weight` DOUBLE NOT NULL DEFAULT 0.5;

-- CreateTable
CREATE TABLE `PUBLIC_RATING` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `rating` DOUBLE NOT NULL,
    `seed` DOUBLE NOT NULL,
    `matches` INTEGER NOT NULL,
    `last_played` DATE NULL,
    `missed_weeks` INTEGER NOT NULL,
    `recalculated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PUBLIC_RATING_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PUBLIC_RATING_EVENT` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `kind` ENUM('SEED', 'MATCH', 'INACTIVITY') NOT NULL,
    `event_date` DATE NOT NULL,
    `encounter_id` INTEGER NULL,
    `squad_id` INTEGER NULL,
    `old_rating` DOUBLE NOT NULL,
    `new_rating` DOUBLE NOT NULL,
    `delta` DOUBLE NOT NULL,
    `details` JSON NULL,

    INDEX `PUBLIC_RATING_EVENT_email_event_date_idx`(`email`, `event_date`),
    INDEX `PUBLIC_RATING_EVENT_encounter_id_idx`(`encounter_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
