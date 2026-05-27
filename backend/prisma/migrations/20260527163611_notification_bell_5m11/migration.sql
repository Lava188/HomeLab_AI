/*
  Warnings:

  - You are about to alter the column `roleTarget` on the `notification` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(11))`.
  - You are about to alter the column `type` on the `notification` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(12))`.

*/
-- AlterTable
ALTER TABLE `notification` MODIFY `roleTarget` ENUM('ADMIN', 'COLLECTOR') NOT NULL,
    MODIFY `type` ENUM('BOOKING_CREATED', 'ASSIGNMENT_AUTO_CREATED', 'ASSIGNMENT_MANUAL_CREATED', 'ASSIGNMENT_REJECTED', 'COLLECTOR_TASK_ASSIGNED') NOT NULL;
