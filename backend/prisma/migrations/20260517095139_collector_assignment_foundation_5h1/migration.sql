-- CreateTable
CREATE TABLE `CollectorWorkingArea` (
    `id` VARCHAR(191) NOT NULL,
    `staffProfileId` VARCHAR(191) NOT NULL,
    `province` VARCHAR(191) NOT NULL,
    `district` VARCHAR(191) NULL,
    `ward` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CollectorWorkingArea_staffProfileId_idx`(`staffProfileId`),
    INDEX `CollectorWorkingArea_province_district_ward_idx`(`province`, `district`, `ward`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CollectorWorkingSchedule` (
    `id` VARCHAR(191) NOT NULL,
    `staffProfileId` VARCHAR(191) NOT NULL,
    `workDate` DATE NOT NULL,
    `startTime` VARCHAR(191) NOT NULL,
    `endTime` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `capacity` INTEGER NOT NULL DEFAULT 8,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CollectorWorkingSchedule_staffProfileId_idx`(`staffProfileId`),
    INDEX `CollectorWorkingSchedule_workDate_idx`(`workDate`),
    INDEX `CollectorWorkingSchedule_staffProfileId_workDate_idx`(`staffProfileId`, `workDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CollectorAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `collectorId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING_COLLECTOR_CONFIRMATION', 'ACCEPTED', 'REJECTED_PENDING_ADMIN_REVIEW', 'REJECTION_APPROVED', 'REJECTION_REJECTED', 'CANCELLED', 'EXPIRED', 'SUPERSEDED') NOT NULL DEFAULT 'PENDING_COLLECTOR_CONFIRMATION',
    `assignmentSource` ENUM('AUTO', 'ADMIN') NOT NULL DEFAULT 'AUTO',
    `reviewStatus` ENUM('NONE', 'PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'NONE',
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acceptedAt` DATETIME(3) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `rejectReason` TEXT NULL,
    `adminReviewedById` VARCHAR(191) NULL,
    `adminReviewedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CollectorAssignment_bookingId_idx`(`bookingId`),
    INDEX `CollectorAssignment_collectorId_idx`(`collectorId`),
    INDEX `CollectorAssignment_status_idx`(`status`),
    INDEX `CollectorAssignment_assignmentSource_idx`(`assignmentSource`),
    INDEX `CollectorAssignment_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CollectorAssignmentHistory` (
    `id` VARCHAR(191) NOT NULL,
    `assignmentId` VARCHAR(191) NOT NULL,
    `fromStatus` ENUM('PENDING_COLLECTOR_CONFIRMATION', 'ACCEPTED', 'REJECTED_PENDING_ADMIN_REVIEW', 'REJECTION_APPROVED', 'REJECTION_REJECTED', 'CANCELLED', 'EXPIRED', 'SUPERSEDED') NULL,
    `toStatus` ENUM('PENDING_COLLECTOR_CONFIRMATION', 'ACCEPTED', 'REJECTED_PENDING_ADMIN_REVIEW', 'REJECTION_APPROVED', 'REJECTION_REJECTED', 'CANCELLED', 'EXPIRED', 'SUPERSEDED') NOT NULL,
    `actorType` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `reason` TEXT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CollectorAssignmentHistory_assignmentId_idx`(`assignmentId`),
    INDEX `CollectorAssignmentHistory_toStatus_idx`(`toStatus`),
    INDEX `CollectorAssignmentHistory_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CollectorWorkingArea` ADD CONSTRAINT `CollectorWorkingArea_staffProfileId_fkey` FOREIGN KEY (`staffProfileId`) REFERENCES `StaffProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectorWorkingSchedule` ADD CONSTRAINT `CollectorWorkingSchedule_staffProfileId_fkey` FOREIGN KEY (`staffProfileId`) REFERENCES `StaffProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectorAssignment` ADD CONSTRAINT `CollectorAssignment_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectorAssignment` ADD CONSTRAINT `CollectorAssignment_collectorId_fkey` FOREIGN KEY (`collectorId`) REFERENCES `StaffProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectorAssignmentHistory` ADD CONSTRAINT `CollectorAssignmentHistory_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `CollectorAssignment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
