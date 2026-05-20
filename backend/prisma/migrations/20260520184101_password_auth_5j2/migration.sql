-- AlterTable
ALTER TABLE `patient` ADD COLUMN `passwordHash` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `staffprofile` ADD COLUMN `passwordHash` VARCHAR(191) NULL;
