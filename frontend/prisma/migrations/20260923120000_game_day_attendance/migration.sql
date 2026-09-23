-- Game day attendance vote & open-slot assignment (ATTENDANCE_VOTE_PLAN.md).
-- All additive: three new tables, one nullable JSON column on Squad, one nullable FK on Game.
-- No backfill and nothing that can fail on populated tables.

-- AlterTable
ALTER TABLE `Game` ADD COLUMN `game_day_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `Squad` ADD COLUMN `game_day_ops` JSON NULL;

-- CreateTable
CREATE TABLE `GAME_DAY` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `squad_id` INTEGER NOT NULL,
    `game_date` DATE NOT NULL,
    `start_time` VARCHAR(5) NOT NULL,
    `end_time` VARCHAR(5) NOT NULL,
    `timezone` VARCHAR(64) NOT NULL,
    `min_players` INTEGER NULL,
    `status` ENUM('VOTING_OPEN', 'VOTING_CLOSED', 'CANCELLED') NOT NULL DEFAULT 'VOTING_OPEN',
    `votes_close_at` DATETIME(3) NOT NULL,
    `slot_lock_at` DATETIME(3) NOT NULL,
    `announced_at` DATETIME(3) NULL,
    `reminded_at` DATETIME(3) NULL,
    `open_slot_pinged_at` DATETIME(3) NULL,
    `voting_closed_at` DATETIME(3) NULL,
    `open_slot_ping_sent` BOOLEAN NOT NULL DEFAULT false,
    `announced_vacancies` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `GAME_DAY_squad_id_status_idx`(`squad_id`, `status`),
    UNIQUE INDEX `GAME_DAY_squad_id_game_date_key`(`squad_id`, `game_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GAME_DAY_VOTE` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `game_day_id` INTEGER NOT NULL,
    `player_id` INTEGER NOT NULL,
    `choice` ENUM('IN', 'OUT') NULL,
    `inherited_from_player_id` INTEGER NULL,
    `voted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `GAME_DAY_VOTE_game_day_id_choice_idx`(`game_day_id`, `choice`),
    UNIQUE INDEX `GAME_DAY_VOTE_game_day_id_player_id_key`(`game_day_id`, `player_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GAME_DAY_OPEN_SLOT` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `game_day_id` INTEGER NOT NULL,
    `player_id` INTEGER NOT NULL,
    `status` ENUM('WAITING', 'ASSIGNED', 'WITHDRAWN') NOT NULL DEFAULT 'WAITING',
    `source` ENUM('WAITING_LIST', 'DIRECT') NULL,
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `assigned_at` DATETIME(3) NULL,
    `withdrawn_at` DATETIME(3) NULL,

    INDEX `GAME_DAY_OPEN_SLOT_game_day_id_status_idx`(`game_day_id`, `status`),
    UNIQUE INDEX `GAME_DAY_OPEN_SLOT_game_day_id_player_id_key`(`game_day_id`, `player_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Game_game_day_id_key` ON `Game`(`game_day_id`);

-- AddForeignKey
ALTER TABLE `Game` ADD CONSTRAINT `Game_game_day_id_fkey` FOREIGN KEY (`game_day_id`) REFERENCES `GAME_DAY`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GAME_DAY` ADD CONSTRAINT `GAME_DAY_squad_id_fkey` FOREIGN KEY (`squad_id`) REFERENCES `Squad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GAME_DAY_VOTE` ADD CONSTRAINT `GAME_DAY_VOTE_game_day_id_fkey` FOREIGN KEY (`game_day_id`) REFERENCES `GAME_DAY`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GAME_DAY_VOTE` ADD CONSTRAINT `GAME_DAY_VOTE_player_id_fkey` FOREIGN KEY (`player_id`) REFERENCES `PLAYER`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GAME_DAY_OPEN_SLOT` ADD CONSTRAINT `GAME_DAY_OPEN_SLOT_game_day_id_fkey` FOREIGN KEY (`game_day_id`) REFERENCES `GAME_DAY`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GAME_DAY_OPEN_SLOT` ADD CONSTRAINT `GAME_DAY_OPEN_SLOT_player_id_fkey` FOREIGN KEY (`player_id`) REFERENCES `PLAYER`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
