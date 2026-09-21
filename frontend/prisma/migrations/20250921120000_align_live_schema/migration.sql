-- Align live `brs` schema with schema.prisma (squad tenancy + ranking tables).
-- Idempotent on empty DBs, ranking tables that predate squad_id, init-only Game DBs,
-- and databases that already match this schema.

-- ---------------------------------------------------------------------------
-- 1. Core tenant tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `Squad` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `max_players` INTEGER NULL,
    `is_public` BOOLEAN NOT NULL DEFAULT true,
    `schedule` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `Squad_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SquadAdmin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `squadId` INTEGER NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    UNIQUE INDEX `SquadAdmin_squadId_email_key`(`squadId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. Ranking tables (legacy shape if missing; squad columns added below)
-- ---------------------------------------------------------------------------

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
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. Game table (from init migration if missing) and nullable squad columns
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `Game` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `groups` JSON NOT NULL,
    `scores` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add nullable squad / email columns (skip if present)
-- ---------------------------------------------------------------------------

SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'PLAYER' AND column_name = 'squad_id'
);
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `PLAYER` ADD COLUMN `squad_id` INTEGER NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ENCOUNTER' AND column_name = 'squad_id'
);
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `ENCOUNTER` ADD COLUMN `squad_id` INTEGER NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'Game' AND column_name = 'squadId'
);
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `Game` ADD COLUMN `squadId` INTEGER NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'Squad' AND column_name = 'max_players'
);
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `Squad` ADD COLUMN `max_players` INTEGER NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'Squad' AND column_name = 'schedule'
);
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `Squad` ADD COLUMN `schedule` JSON NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'Squad' AND column_name = 'is_public'
);
SET @sql = IF(
    @col_exists = 0,
    'ALTER TABLE `Squad` ADD COLUMN `is_public` BOOLEAN NOT NULL DEFAULT true',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 4. Optional: pack legacy schedule columns into JSON (if they still exist)
-- ---------------------------------------------------------------------------

SET @has_old_schedule = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'Squad' AND column_name = 'is_recurring'
);
SET @sql = IF(
    @has_old_schedule > 0,
    'UPDATE `Squad` SET `schedule` = JSON_OBJECT(
        ''isRecurring'', IFNULL(`is_recurring`, false),
        ''dayOfWeek'', `schedule_day_of_week`,
        ''startTime'', `schedule_start_time`,
        ''endTime'', `schedule_end_time`,
        ''startDate'', DATE_FORMAT(`schedule_start_date`, ''%Y-%m-%d''),
        ''endDate'', DATE_FORMAT(`schedule_end_date`, ''%Y-%m-%d''),
        ''skipDates'', IFNULL(`schedule_skip_dates`, JSON_ARRAY())
    ) WHERE `schedule` IS NULL',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 5. Backfill squad_id / squadId and placeholder emails
-- ---------------------------------------------------------------------------

INSERT INTO `Squad` (`name`, `slug`, `enabled`, `updatedAt`)
SELECT 'Default Squad', 'default', true, NOW(3)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Squad` LIMIT 1);

INSERT INTO `Squad` (`name`, `slug`, `enabled`, `updatedAt`)
SELECT 'Default Squad', 'default', true, NOW(3)
FROM DUAL
WHERE (
    EXISTS (SELECT 1 FROM `PLAYER` WHERE `squad_id` IS NULL LIMIT 1)
    OR EXISTS (SELECT 1 FROM `ENCOUNTER` WHERE `squad_id` IS NULL LIMIT 1)
    OR EXISTS (SELECT 1 FROM `Game` WHERE `squadId` IS NULL LIMIT 1)
)
AND NOT EXISTS (SELECT 1 FROM `Squad` WHERE `slug` = 'default' LIMIT 1);

SET @backfill_squad_id = COALESCE(
    (SELECT `id` FROM `Squad` WHERE `slug` = 'default' LIMIT 1),
    (SELECT MIN(`id`) FROM `Squad`)
);

UPDATE `PLAYER` SET `squad_id` = @backfill_squad_id WHERE `squad_id` IS NULL;
UPDATE `ENCOUNTER` SET `squad_id` = @backfill_squad_id WHERE `squad_id` IS NULL;
UPDATE `Game` SET `squadId` = @backfill_squad_id WHERE `squadId` IS NULL;

UPDATE `PLAYER`
SET `email` = CONCAT('player', `id`, '@placeholder.invalid')
WHERE `email` IS NULL OR `email` = '';

-- ---------------------------------------------------------------------------
-- 6. Drop pre-squad ENCOUNTER unique index (team only) before re-creating
-- ---------------------------------------------------------------------------

SET @old_team_uniq = (
    SELECT COUNT(*) FROM information_schema.statistics s
    WHERE s.table_schema = DATABASE()
      AND s.table_name = 'ENCOUNTER'
      AND s.index_name = 'team_uniqness'
      AND NOT EXISTS (
          SELECT 1 FROM information_schema.statistics s2
          WHERE s2.table_schema = s.table_schema
            AND s2.table_name = s.table_name
            AND s2.index_name = s.index_name
            AND s2.column_name = 'squad_id'
      )
);
SET @sql = IF(@old_team_uniq > 0, 'DROP INDEX `team_uniqness` ON `ENCOUNTER`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 7. Contract: NOT NULL columns
-- ---------------------------------------------------------------------------

SET @nullable = (
    SELECT IS_NULLABLE FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'PLAYER' AND column_name = 'squad_id'
    LIMIT 1
);
SET @sql = IF(@nullable = 'YES', 'ALTER TABLE `PLAYER` MODIFY `squad_id` INTEGER NOT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @nullable = (
    SELECT IS_NULLABLE FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'PLAYER' AND column_name = 'email'
    LIMIT 1
);
SET @sql = IF(
    @nullable = 'YES',
    'ALTER TABLE `PLAYER` MODIFY `email` VARCHAR(255) NOT NULL, MODIFY `player_status` VARCHAR(191) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @nullable = (
    SELECT IS_NULLABLE FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ENCOUNTER' AND column_name = 'squad_id'
    LIMIT 1
);
SET @sql = IF(@nullable = 'YES', 'ALTER TABLE `ENCOUNTER` MODIFY `squad_id` INTEGER NOT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @nullable = (
    SELECT IS_NULLABLE FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'Game' AND column_name = 'squadId'
    LIMIT 1
);
SET @sql = IF(@nullable = 'YES', 'ALTER TABLE `Game` MODIFY `squadId` INTEGER NOT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 8. Indexes (skip if present)
-- ---------------------------------------------------------------------------

SET @idx_exists = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'PLAYER' AND index_name = 'PLAYER_squad_id_idx'
);
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX `PLAYER_squad_id_idx` ON `PLAYER`(`squad_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'PLAYER' AND index_name = 'PLAYER_squad_id_email_key'
);
SET @sql = IF(
    @idx_exists = 0,
    'CREATE UNIQUE INDEX `PLAYER_squad_id_email_key` ON `PLAYER`(`squad_id`, `email`)',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ENCOUNTER' AND index_name = 'ENCOUNTER_squad_id_idx'
);
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX `ENCOUNTER_squad_id_idx` ON `ENCOUNTER`(`squad_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ENCOUNTER' AND index_name = 'team_uniqness'
);
SET @sql = IF(
    @idx_exists = 0,
    'CREATE UNIQUE INDEX `team_uniqness` ON `ENCOUNTER`(`squad_id`, `team_1`, `team_2`, `encounter_date`)',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'Game' AND index_name = 'Game_squadId_idx'
);
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX `Game_squadId_idx` ON `Game`(`squadId`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 9. Foreign keys (drop legacy definitions, add Prisma semantics)
-- ---------------------------------------------------------------------------

SET @fk_exists = (
    SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE table_schema = DATABASE() AND table_name = 'PLAYER' AND constraint_name = 'PLAYER_squad_id_fkey'
);
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `PLAYER` DROP FOREIGN KEY `PLAYER_squad_id_fkey`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
    SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE table_schema = DATABASE() AND table_name = 'ENCOUNTER' AND constraint_name = 'ENCOUNTER_squad_id_fkey'
);
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `ENCOUNTER` DROP FOREIGN KEY `ENCOUNTER_squad_id_fkey`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
    SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE table_schema = DATABASE() AND table_name = 'Game' AND constraint_name = 'Game_squadId_fkey'
);
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `Game` DROP FOREIGN KEY `Game_squadId_fkey`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
    SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE table_schema = DATABASE() AND table_name = 'SquadAdmin' AND constraint_name = 'SquadAdmin_squadId_fkey'
);
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `SquadAdmin` DROP FOREIGN KEY `SquadAdmin_squadId_fkey`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE `PLAYER` ADD CONSTRAINT `PLAYER_squad_id_fkey` FOREIGN KEY (`squad_id`) REFERENCES `Squad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ENCOUNTER` ADD CONSTRAINT `ENCOUNTER_squad_id_fkey` FOREIGN KEY (`squad_id`) REFERENCES `Squad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Game` ADD CONSTRAINT `Game_squadId_fkey` FOREIGN KEY (`squadId`) REFERENCES `Squad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `SquadAdmin` ADD CONSTRAINT `SquadAdmin_squadId_fkey` FOREIGN KEY (`squadId`) REFERENCES `Squad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
