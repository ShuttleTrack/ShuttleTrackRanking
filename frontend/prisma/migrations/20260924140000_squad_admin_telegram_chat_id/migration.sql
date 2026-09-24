-- Admin Telegram group for pending admin actions and important roster updates
-- (lib/adminNotifications.ts). Additive, nullable: null = no admin group, nothing sent.

-- AlterTable
ALTER TABLE `Squad` ADD COLUMN `admin_telegram_chat_id` VARCHAR(191) NULL;
