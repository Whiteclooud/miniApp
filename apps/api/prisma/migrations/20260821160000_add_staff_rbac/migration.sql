ALTER TABLE `users`
  ADD COLUMN `system_role` ENUM('USER', 'SYSTEM_ADMIN') NOT NULL DEFAULT 'USER' AFTER `role`;

CREATE TABLE `staff_members` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `role` ENUM('STAFF', 'OWNER') NOT NULL,
  `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
  `created_by_user_id` VARCHAR(191) NULL,
  `disabled_by_user_id` VARCHAR(191) NULL,
  `disabled_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `staff_members_user_id_key`(`user_id`),
  INDEX `idx_staff_members_role_status`(`role`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_staff_members_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Preserve existing STAFF users as owners during the one-time migration. New
-- authorization decisions are made from staff_members, never users.role.
INSERT INTO `staff_members` (
  `id`, `user_id`, `role`, `status`, `created_at`, `updated_at`
)
SELECT
  CONCAT('legacy_', REPLACE(UUID(), '-', '')),
  `id`,
  'OWNER',
  'ACTIVE',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `users`
WHERE `role` = 'STAFF';

CREATE TABLE `staff_invitations` (
  `id` VARCHAR(191) NOT NULL,
  `code_hash` VARCHAR(64) NOT NULL,
  `role` ENUM('STAFF', 'OWNER') NOT NULL,
  `status` ENUM('PENDING', 'REDEEMED', 'REVOKED') NOT NULL DEFAULT 'PENDING',
  `expires_at` DATETIME(3) NOT NULL,
  `created_by_user_id` VARCHAR(191) NOT NULL,
  `redeemed_by_user_id` VARCHAR(191) NULL,
  `redeemed_at` DATETIME(3) NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `staff_invitations_code_hash_key`(`code_hash`),
  INDEX `idx_staff_invitations_status_expires_at`(`status`, `expires_at`),
  INDEX `idx_staff_invitations_creator_created_at`(`created_by_user_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
