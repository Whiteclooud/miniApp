ALTER TABLE `appointments`
  MODIFY `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW') NOT NULL DEFAULT 'PENDING';

ALTER TABLE `appointments`
  ADD COLUMN `cancelled_at` DATETIME(3) NULL,
  ADD COLUMN `cancelled_by_open_id` VARCHAR(191) NULL,
  ADD COLUMN `cancel_reason` TEXT NULL;

CREATE TABLE `appointment_audit_logs` (
  `id` VARCHAR(191) NOT NULL,
  `appointment_id` VARCHAR(191) NOT NULL,
  `actor_open_id` VARCHAR(191) NULL,
  `actor_role` VARCHAR(32) NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `from_status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW') NULL,
  `to_status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW') NULL,
  `from_date` VARCHAR(10) NULL,
  `to_date` VARCHAR(10) NULL,
  `from_time_slot` VARCHAR(32) NULL,
  `to_time_slot` VARCHAR(32) NULL,
  `note` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_appointment_audit_logs_appointment_id_created_at`(`appointment_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `booking_rules`
  ADD COLUMN `weekly_open_days_json` LONGTEXT NULL,
  ADD COLUMN `same_day_cutoff_time` VARCHAR(5) NULL,
  ADD COLUMN `min_advance_hours` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `date_slot_overrides_json` LONGTEXT NULL;

UPDATE `booking_rules`
SET
  `weekly_open_days_json` = COALESCE(`weekly_open_days_json`, '[0,1,2,3,4,5,6]'),
  `date_slot_overrides_json` = COALESCE(`date_slot_overrides_json`, '{}');

ALTER TABLE `booking_rules`
  MODIFY `weekly_open_days_json` LONGTEXT NOT NULL,
  MODIFY `date_slot_overrides_json` LONGTEXT NOT NULL;
