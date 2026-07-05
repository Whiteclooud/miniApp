SET @approved_slot_key_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'appointments'
    AND COLUMN_NAME = 'approved_slot_key'
);
SET @add_approved_slot_key_sql := IF(
  @approved_slot_key_exists = 0,
  'ALTER TABLE `appointments` ADD COLUMN `approved_slot_key` VARCHAR(64) NULL',
  'SELECT 1'
);
PREPARE add_approved_slot_key_stmt FROM @add_approved_slot_key_sql;
EXECUTE add_approved_slot_key_stmt;
DEALLOCATE PREPARE add_approved_slot_key_stmt;

UPDATE `appointments`
SET `approved_slot_key` = CONCAT(`date`, '#', `time_slot`)
WHERE `status` = 'APPROVED'
  AND `approved_slot_key` IS NULL;

SET @approved_slot_key_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'appointments'
    AND INDEX_NAME = 'appointments_approved_slot_key_key'
);
SET @add_approved_slot_key_index_sql := IF(
  @approved_slot_key_index_exists = 0,
  'CREATE UNIQUE INDEX `appointments_approved_slot_key_key` ON `appointments`(`approved_slot_key`)',
  'SELECT 1'
);
PREPARE add_approved_slot_key_index_stmt FROM @add_approved_slot_key_index_sql;
EXECUTE add_approved_slot_key_index_stmt;
DEALLOCATE PREPARE add_approved_slot_key_index_stmt;
