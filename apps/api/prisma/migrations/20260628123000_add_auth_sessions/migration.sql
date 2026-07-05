CREATE TABLE `auth_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `open_id` VARCHAR(191) NOT NULL,
    `role` ENUM('CUSTOMER', 'STAFF') NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `auth_sessions_token_hash_key`(`token_hash`),
    INDEX `idx_auth_sessions_user_id`(`user_id`),
    INDEX `idx_auth_sessions_open_id`(`open_id`),
    INDEX `idx_auth_sessions_expires_at`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
