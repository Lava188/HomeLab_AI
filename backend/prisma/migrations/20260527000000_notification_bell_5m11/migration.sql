-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `roleTarget` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `staffProfileId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `bookingId` VARCHAR(191) NULL,
    `assignmentId` VARCHAR(191) NULL,
    `metadata` TEXT NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Notification_roleTarget_idx` ON `Notification`(`roleTarget`);

-- CreateIndex
CREATE INDEX `Notification_userId_idx` ON `Notification`(`userId`);

-- CreateIndex
CREATE INDEX `Notification_staffProfileId_idx` ON `Notification`(`staffProfileId`);

-- CreateIndex
CREATE INDEX `Notification_type_idx` ON `Notification`(`type`);

-- CreateIndex
CREATE INDEX `Notification_bookingId_idx` ON `Notification`(`bookingId`);

-- CreateIndex
CREATE INDEX `Notification_assignmentId_idx` ON `Notification`(`assignmentId`);

-- CreateIndex
CREATE INDEX `Notification_readAt_idx` ON `Notification`(`readAt`);

-- CreateIndex
CREATE INDEX `Notification_createdAt_idx` ON `Notification`(`createdAt`);

-- Add foreign key relationships if needed
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_staffProfileId_fkey` FOREIGN KEY (`staffProfileId`) REFERENCES `StaffProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Notification` ADD CONSTRAINT `Notification_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Notification` ADD CONSTRAINT `Notification_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `CollectorAssignment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
