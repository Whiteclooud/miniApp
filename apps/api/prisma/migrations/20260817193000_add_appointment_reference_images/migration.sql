ALTER TABLE `appointments`
  ADD COLUMN `reference_image_urls_json` LONGTEXT NULL;

UPDATE `appointments`
SET `reference_image_urls_json` = '[]'
WHERE `reference_image_urls_json` IS NULL;

ALTER TABLE `appointments`
  MODIFY COLUMN `reference_image_urls_json` LONGTEXT NOT NULL;
