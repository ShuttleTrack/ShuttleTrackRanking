-- Multi-squad tenancy, Stage 1 - Expand (SQUAD_TENANCY_PLAN.md).
--
-- Pure schema DDL only: new tables, and new columns on existing tables added NULLABLE so this
-- is safe to run against the live, populated database while the current single-squad
-- application code keeps running (it doesn't reference squad_id/squadId yet, so it's unaffected
-- by these columns existing). Data changes (creating the actual Squad row, backfilling
-- squad_id/squadId onto existing rows, assigning placeholder emails, seeding SquadAdmin from
-- ALLOWED_ADMIN_EMAILS) are deliberately NOT in this file - they're parameterized per
-- environment (squad name/slug, admin email list) and are run by
-- ../../scripts/migrate-to-squads.mjs stage1, which executes this file first and then does that
-- data work.
--
-- The three ALTER TABLE ADD COLUMN statements below are plain MySQL - it has no ADD COLUMN IF
-- NOT EXISTS (that's a MariaDB-ism), so re-running this file after a partial run fails loudly
-- with "Duplicate column name" rather than silently skipping. scripts/migrate-to-squads.mjs's
-- stage1 tolerates exactly that one error per statement so the script itself is safe to re-run;
-- if you're applying this file by hand instead, run it once and expect a real error on a second
-- run.

CREATE TABLE IF NOT EXISTS `Squad` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Squad_slug_key` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `SquadAdmin` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `squadId` INT NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `SquadAdmin_squadId_email_key` (`squadId`, `email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `PLAYER` ADD COLUMN `squad_id` INT NULL;

ALTER TABLE `ENCOUNTER` ADD COLUMN `squad_id` INT NULL;

ALTER TABLE `Game` ADD COLUMN `squadId` INT NULL;
