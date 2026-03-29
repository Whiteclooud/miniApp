SET @description_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'gallery_items'
    AND COLUMN_NAME = 'description'
);
SET @add_description_sql := IF(
  @description_exists = 0,
  'ALTER TABLE `gallery_items` ADD COLUMN `description` TEXT NULL',
  'SELECT 1'
);
PREPARE add_description_stmt FROM @add_description_sql;
EXECUTE add_description_stmt;
DEALLOCATE PREPARE add_description_stmt;

SET @published_at_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'gallery_items'
    AND COLUMN_NAME = 'published_at'
);
SET @add_published_at_sql := IF(
  @published_at_exists = 0,
  'ALTER TABLE `gallery_items` ADD COLUMN `published_at` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE add_published_at_stmt FROM @add_published_at_sql;
EXECUTE add_published_at_stmt;
DEALLOCATE PREPARE add_published_at_stmt;

UPDATE `gallery_items`
SET `published_at` = `created_at`
WHERE `published_at` IS NULL;

ALTER TABLE `gallery_items`
  MODIFY COLUMN `published_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

SET @created_by_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'gallery_items'
    AND COLUMN_NAME = 'created_by_open_id'
);
SET @add_created_by_sql := IF(
  @created_by_exists = 0,
  'ALTER TABLE `gallery_items` ADD COLUMN `created_by_open_id` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE add_created_by_stmt FROM @add_created_by_sql;
EXECUTE add_created_by_stmt;
DEALLOCATE PREPARE add_created_by_stmt;

SET @published_at_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'gallery_items'
    AND INDEX_NAME = 'idx_gallery_items_published_at'
);
SET @add_published_at_index_sql := IF(
  @published_at_index_exists = 0,
  'CREATE INDEX `idx_gallery_items_published_at` ON `gallery_items`(`published_at`)',
  'SELECT 1'
);
PREPARE add_published_at_index_stmt FROM @add_published_at_index_sql;
EXECUTE add_published_at_index_stmt;
DEALLOCATE PREPARE add_published_at_index_stmt;
