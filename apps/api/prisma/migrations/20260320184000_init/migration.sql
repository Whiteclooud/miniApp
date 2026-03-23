CREATE TABLE `users` (
  `id` VARCHAR(191) NOT NULL,
  `open_id` VARCHAR(191) NOT NULL,
  `role` ENUM('CUSTOMER', 'STAFF') NOT NULL,
  `display_name` VARCHAR(191) NULL,
  `phone` VARCHAR(32) NULL,
  `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `users_open_id_key`(`open_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `appointments` (
  `id` VARCHAR(191) NOT NULL,
  `customer_open_id` VARCHAR(191) NOT NULL,
  `customer_name` VARCHAR(191) NULL,
  `phone` VARCHAR(32) NULL,
  `date` VARCHAR(10) NOT NULL,
  `time_slot` VARCHAR(32) NOT NULL,
  `note` TEXT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reviewed_at` DATETIME(3) NULL,
  `reviewed_by_open_id` VARCHAR(191) NULL,
  `review_note` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_appointments_customer_open_id`(`customer_open_id`),
  INDEX `idx_appointments_date`(`date`),
  INDEX `idx_appointments_status`(`status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `booking_rules` (
  `id` VARCHAR(191) NOT NULL,
  `advance_open_days` INTEGER NOT NULL DEFAULT 7,
  `closed_dates_json` LONGTEXT NOT NULL,
  `daily_slots_json` LONGTEXT NOT NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `gallery_items` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `image_url` TEXT NOT NULL,
  `image_urls_json` LONGTEXT NOT NULL,
  `tags_json` LONGTEXT NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_gallery_items_sort_order`(`sort_order`),
  INDEX `idx_gallery_items_status`(`status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
