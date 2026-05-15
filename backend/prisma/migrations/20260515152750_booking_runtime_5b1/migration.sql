-- CreateTable
CREATE TABLE `Patient` (
    `id` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `gender` VARCHAR(191) NULL,
    `defaultAddress` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Patient_phone_key`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TestCatalogItem` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `category` VARCHAR(191) NULL,
    `sampleType` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TestCatalogItem_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffProfile` (
    `id` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `role` ENUM('ADMIN', 'STAFF', 'SAMPLE_COLLECTOR', 'LAB_TECHNICIAN') NOT NULL,
    `serviceArea` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AvailabilitySlot` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `startTime` TIME(0) NOT NULL,
    `endTime` TIME(0) NOT NULL,
    `capacity` INTEGER NOT NULL,
    `bookedCount` INTEGER NOT NULL DEFAULT 0,
    `area` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AvailabilitySlot_date_area_idx`(`date`, `area`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Booking` (
    `id` VARCHAR(191) NOT NULL,
    `bookingCode` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NULL,
    `testCatalogItemId` VARCHAR(191) NULL,
    `testTypeText` VARCHAR(191) NULL,
    `sampleDate` DATE NOT NULL,
    `sampleTimeStart` TIME(0) NULL,
    `sampleTimeEnd` TIME(0) NULL,
    `address` TEXT NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `patientName` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULED', 'ASSIGNED', 'SAMPLE_COLLECTED', 'IN_LAB_PROCESSING', 'RESULT_READY', 'COMPLETED', 'CANCELLED', 'NO_SHOW') NOT NULL DEFAULT 'DRAFT',
    `note` TEXT NULL,
    `internalNote` TEXT NULL,
    `assignedStaffId` VARCHAR(191) NULL,
    `createdFromSessionId` VARCHAR(191) NULL,
    `createdSource` ENUM('CHAT', 'ADMIN', 'STAFF') NOT NULL DEFAULT 'CHAT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `cancelledAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Booking_bookingCode_key`(`bookingCode`),
    INDEX `Booking_patientId_idx`(`patientId`),
    INDEX `Booking_testCatalogItemId_idx`(`testCatalogItemId`),
    INDEX `Booking_assignedStaffId_idx`(`assignedStaffId`),
    INDEX `Booking_status_idx`(`status`),
    INDEX `Booking_sampleDate_idx`(`sampleDate`),
    INDEX `Booking_createdFromSessionId_idx`(`createdFromSessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookingDraft` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NULL,
    `slotsJson` JSON NOT NULL,
    `missingFields` JSON NOT NULL,
    `status` ENUM('DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULED', 'ASSIGNED', 'SAMPLE_COLLECTED', 'IN_LAB_PROCESSING', 'RESULT_READY', 'COMPLETED', 'CANCELLED', 'NO_SHOW') NOT NULL DEFAULT 'DRAFT',
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BookingDraft_sessionId_idx`(`sessionId`),
    INDEX `BookingDraft_patientId_idx`(`patientId`),
    INDEX `BookingDraft_status_idx`(`status`),
    INDEX `BookingDraft_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookingStatusHistory` (
    `id` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `fromStatus` ENUM('DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULED', 'ASSIGNED', 'SAMPLE_COLLECTED', 'IN_LAB_PROCESSING', 'RESULT_READY', 'COMPLETED', 'CANCELLED', 'NO_SHOW') NULL,
    `toStatus` ENUM('DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULED', 'ASSIGNED', 'SAMPLE_COLLECTED', 'IN_LAB_PROCESSING', 'RESULT_READY', 'COMPLETED', 'CANCELLED', 'NO_SHOW') NOT NULL,
    `reason` VARCHAR(191) NULL,
    `changedByType` VARCHAR(191) NOT NULL,
    `changedById` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BookingStatusHistory_bookingId_idx`(`bookingId`),
    INDEX `BookingStatusHistory_toStatus_idx`(`toStatus`),
    INDEX `BookingStatusHistory_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `Patient`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_testCatalogItemId_fkey` FOREIGN KEY (`testCatalogItemId`) REFERENCES `TestCatalogItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_assignedStaffId_fkey` FOREIGN KEY (`assignedStaffId`) REFERENCES `StaffProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingDraft` ADD CONSTRAINT `BookingDraft_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `Patient`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingStatusHistory` ADD CONSTRAINT `BookingStatusHistory_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
