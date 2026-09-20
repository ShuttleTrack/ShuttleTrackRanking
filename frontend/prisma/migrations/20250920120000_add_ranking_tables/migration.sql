-- CreateTable
CREATE TABLE IF NOT EXISTS `PLAYER` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(32) NOT NULL,
    `rank_score` DOUBLE NOT NULL DEFAULT 1000,
    `player_rank` INTEGER NULL,
    `highest_rank` INTEGER NULL,
    `rank_since` DATE NULL,
    `color_hex` VARCHAR(6) NOT NULL DEFAULT 'aaaaaa',
    `disabled` BIT(1) NOT NULL DEFAULT b'0',
    `email` VARCHAR(255) NULL,
    `player_status` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `ENCOUNTER` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `team_1` VARCHAR(32) NOT NULL,
    `team_2` VARCHAR(32) NOT NULL,
    `encounter_date` DATE NOT NULL,
    `processed` BOOLEAN NOT NULL DEFAULT false,
    `team_1_set_points` INTEGER NOT NULL,
    `team_2_set_points` INTEGER NOT NULL,
    `calculated_score` DOUBLE NULL,
    `group_index` INTEGER NULL,
    `total_groups` INTEGER NULL,
    `score_breakdown` JSON NULL,

    UNIQUE INDEX `team_uniqness`(`team_1`, `team_2`, `encounter_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `SCORE_HISTORY` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `player_id` INTEGER NOT NULL,
    `encounter_id` INTEGER NOT NULL,
    `old_rank_score` DOUBLE NOT NULL,
    `new_rank_score` DOUBLE NOT NULL,
    `mysql_inserted_timestamp` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `player_old_rank` INTEGER NULL,
    `player_new_rank` INTEGER NULL,
    `encounter_date` DATE NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
