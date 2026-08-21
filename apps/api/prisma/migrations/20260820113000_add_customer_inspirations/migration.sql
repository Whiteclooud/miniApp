CREATE TABLE `customer_inspirations` (
  `id` VARCHAR(191) NOT NULL,
  `customer_open_id` VARCHAR(191) NOT NULL,
  `gallery_item_id` VARCHAR(191) NOT NULL,
  `note` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `uq_customer_inspirations_owner_gallery`(`customer_open_id`, `gallery_item_id`),
  INDEX `idx_customer_inspirations_owner_created_at`(`customer_open_id`, `created_at`),
  INDEX `idx_customer_inspirations_gallery_item_id`(`gallery_item_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_customer_inspirations_gallery_item`
    FOREIGN KEY (`gallery_item_id`) REFERENCES `gallery_items`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
