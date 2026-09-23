-- ATTENDANCE_VOTE_PLAN.md: when the open-slot group was last told about vacancies, so a retried
-- vacancy post still names the waiting-list players promoted since then. Additive, nullable.

-- AlterTable
ALTER TABLE `GAME_DAY` ADD COLUMN `vacancy_announced_at` DATETIME(3) NULL;
