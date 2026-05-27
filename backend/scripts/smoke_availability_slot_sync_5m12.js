/**
 * SMOKE TEST: Availability Slot Sync from Collector Schedules (5M12)
 *
 * Tests:
 * 1. Sync availability slot từ collector working schedule
 * 2. Cleanup orphaned slots (không có collector)
 * 3. Filter past slots khỏi query
 * 4. Admin API sort slot theo trạng thái
 */

const prisma = require("../src/services/booking-runtime/prisma-client");
const syncService = require("../src/services/booking-runtime/availability-slot-sync.service");
const availabilitySlotService = require("../src/services/booking-runtime/availability-slot.service");
const collectorWorkingProfileService = require("../src/services/collector-working-profile.service");

let testCollectorId = null;
let testDate = null;

async function setupTestCollector() {
    console.log("\n=== SETUP: Creating test collector ===");

    const today = new Date();
    today.setUTCDate(today.getUTCDate() + 1);
    testDate = today.toISOString().slice(0, 10);

    await prisma.collectorWorkingSchedule.deleteMany({
        where: {
            workDate: new Date(testDate)
        }
    });

    await prisma.availabilitySlot.deleteMany({
        where: {
            date: new Date(testDate)
        }
    });

    const existingCollector = await prisma.staffProfile.findFirst({
        where: {
            phone: "0900000123",
            role: "SAMPLE_COLLECTOR"
        }
    });

    if (existingCollector) {
        testCollectorId = existingCollector.id;
        console.log(`Using existing collector: ${existingCollector.fullName} (${existingCollector.id})`);
    } else {
        const collector = await prisma.staffProfile.create({
            data: {
                fullName: "Test Slot Sync Collector",
                phone: "0900000123",
                role: "SAMPLE_COLLECTOR",
                active: true
            }
        });
        testCollectorId = collector.id;
        console.log(`Created test collector: ${collector.fullName} (${collector.id})`);
    }

    await prisma.collectorWorkingSchedule.create({
        data: {
            staffProfileId: testCollectorId,
            workDate: new Date(testDate),
            startTime: "08:30",
            endTime: "09:30",
            active: true,
            capacity: 8
        }
    });

    console.log(`Created working schedule: ${testDate} 08:30-09:30`);

    await prisma.collectorWorkingSchedule.create({
        data: {
            staffProfileId: testCollectorId,
            workDate: new Date(testDate),
            startTime: "14:00",
            endTime: "15:00",
            active: true,
            capacity: 8
        }
    });

    console.log(`Created working schedule: ${testDate} 14:00-15:00`);
}

async function test1_SyncAvailabilityFromCollectors() {
    console.log("\n=== TEST 1: Sync availability slot from collector schedules ===");

    const schedules = await prisma.collectorWorkingSchedule.findMany({
        where: {
            workDate: new Date(testDate),
            active: true
        },
        include: {
            staffProfile: {
                select: {
                    id: true,
                    fullName: true,
                    phone: true,
                    active: true
                }
            }
        }
    });

    console.log(`Active schedules for ${testDate}:`);
    for (const sch of schedules) {
        console.log(`  - ${sch.staffProfile.fullName} (${sch.staffProfile.phone}): ${sch.startTime}-${sch.endTime}`);
    }

    const result = await syncService.syncAvailabilitySlotsForDate(testDate);

    console.log(`Sync result:`, JSON.stringify(result, null, 2));

    if (!result.synced) {
        throw new Error(`Failed to sync: ${result.message}`);
    }

    const slots = await prisma.availabilitySlot.findMany({
        where: {
            date: new Date(testDate)
        },
        orderBy: {
            startTime: "asc"
        }
    });

    console.log(`Slots found: ${slots.length}`);
    for (const slot of slots) {
        const utcHours = String(slot.startTime.getUTCHours()).padStart(2, "0");
        const utcMinutes = String(slot.startTime.getUTCMinutes()).padStart(2, "0");
        console.log(`  - Slot: ${slot.startTime.toISOString()} (${utcHours}:${utcMinutes} UTC)`);
    }

    const expectedSlots = ["08:30", "14:00"];

    for (const expectedTime of expectedSlots) {
        const foundSlot = slots.find(s => {
            const utcHours = String(s.startTime.getUTCHours()).padStart(2, "0");
            const utcMinutes = String(s.startTime.getUTCMinutes()).padStart(2, "0");
            const timeStart = `${utcHours}:${utcMinutes}`;
            return timeStart === expectedTime;
        });

        if (!foundSlot) {
            throw new Error(`Expected slot ${expectedTime} not found. Available: ${slots.map(s => s.startTime.toTimeString().slice(0, 5)).join(", ")}`);
        }

        if (foundSlot.capacity < 1) {
            throw new Error(`Expected capacity>=1 for slot ${expectedTime}, got ${foundSlot.capacity}`);
        }

        console.log(`  - ${testDate} ${expectedTime}: capacity=${foundSlot.capacity}, active=${foundSlot.active}`);
    }

    console.log("✅ TEST 1 PASSED: Slots synced correctly with collector capacity");
}

async function test2_OrphanedSlotCleanup() {
    console.log("\n=== TEST 2: Orphaned slot cleanup ===");

    const orphanedSlot = await prisma.availabilitySlot.create({
        data: {
            date: new Date(testDate),
            startTime: new Date(`1970-01-01T10:00:00.000Z`),
            endTime: new Date(`1970-01-01T11:00:00.000Z`),
            capacity: 5,
            bookedCount: 0,
            active: true
        }
    });

    console.log(`Created orphaned slot: ${orphanedSlot.id}`);

    const result = await syncService.syncAvailabilitySlotsForDate(testDate);

    console.log(`Sync result:`, JSON.stringify(result, null, 2));

    const slots = await prisma.availabilitySlot.findMany({
        where: {
            date: new Date(testDate),
            active: true
        }
    });

    const orphanedActive = slots.find(s => s.id === orphanedSlot.id);

    if (orphanedActive) {
        throw new Error("Orphaned slot should be disabled");
    }

    const orphanedDisabled = await prisma.availabilitySlot.findUnique({
        where: { id: orphanedSlot.id }
    });

    if (orphanedDisabled.active) {
        throw new Error("Orphaned slot should be disabled after sync");
    }

    console.log("✅ TEST 2 PASSED: Orphaned slot disabled correctly");
}

async function test3_PastSlotFilter() {
    console.log("\n=== TEST 3: Past slot filter ===");

    const pastDate = new Date();
    pastDate.setUTCDate(pastDate.getUTCDate() - 2);
    const pastDateStr = pastDate.toISOString().slice(0, 10);

    await prisma.availabilitySlot.create({
        data: {
            date: pastDate,
            startTime: new Date(`1970-01-01T08:00:00.000Z`),
            endTime: new Date(`1970-01-01T09:00:00.000Z`),
            capacity: 2,
            bookedCount: 0,
            active: true
        }
    });

    console.log(`Created past slot for ${pastDateStr}`);

    const availableSlots = await availabilitySlotService.findAvailableNearbySlots({
        requestedDate: new Date(),
        days: 7,
        limit: 50
    });

    const pastSlot = availableSlots.find(s => s.date === pastDateStr);

    if (pastSlot) {
        throw new Error("Past slot should not be returned in available slots");
    }

    console.log("✅ TEST 3 PASSED: Past slots filtered out from available slots");
}

async function test4_SlotStatusClassification() {
    console.log("\n=== TEST 4: Slot status classification ===");

    const today = new Date();
    today.setUTCDate(today.getUTCDate() + 1);
    const futureDateStr = today.toISOString().slice(0, 10);

    const fullSlot = await prisma.availabilitySlot.create({
        data: {
            date: today,
            startTime: new Date(`1970-01-01T16:00:00.000Z`),
            endTime: new Date(`1970-01-01T17:00:00.000Z`),
            capacity: 1,
            bookedCount: 0,
            active: true
        }
    });

    await prisma.booking.create({
        data: {
            bookingCode: `FULL-SLOT-${Date.now()}`,
            sampleDate: today,
            sampleTimeStart: new Date(`1970-01-01T16:00:00.000Z`),
            sampleTimeEnd: new Date(`1970-01-01T17:00:00.000Z`),
            address: "Test address",
            phone: "0900000999",
            patientName: "Test patient",
            status: "CONFIRMED"
        }
    });

    const closedSlot = await prisma.availabilitySlot.create({
        data: {
            date: today,
            startTime: new Date(`1970-01-01T17:00:00.000Z`),
            endTime: new Date(`1970-01-01T18:00:00.000Z`),
            capacity: 1,
            bookedCount: 0,
            active: false
        }
    });

    const allSlots = await availabilitySlotService.listAvailabilitySlots({
        date: futureDateStr
    });

    const fullSlotInfo = allSlots.find(s => {
        const timeStart = s.timeStart;
        return timeStart === "16:00";
    });

    const closedSlotInfo = allSlots.find(s => {
        const timeStart = s.timeStart;
        return timeStart === "17:00";
    });

    if (!fullSlotInfo || !fullSlotInfo.isClosed) {
        throw new Error("Full slot should be marked as closed");
    }

    if (!closedSlotInfo || !closedSlotInfo.isClosed) {
        throw new Error("Inactive slot should be marked as closed");
    }

    console.log("✅ TEST 4 PASSED: Slot status classified correctly");
}

async function test5_CapacityBasedOnCollectors() {
    console.log("\n=== TEST 5: Capacity based on multiple collectors ===");

    const today = new Date();
    today.setUTCDate(today.getUTCDate() + 2);
    const multiDateStr = today.toISOString().slice(0, 10);

    await prisma.collectorWorkingSchedule.deleteMany({
        where: {
            workDate: today
        }
    });

    await prisma.availabilitySlot.deleteMany({
        where: {
            date: today
        }
    });

    const collector2 = await prisma.staffProfile.findFirst({
        where: {
            phone: "0900000124",
            role: "SAMPLE_COLLECTOR"
        }
    });

    let collector2Id = collector2?.id;

    if (!collector2Id) {
        const newCollector = await prisma.staffProfile.create({
            data: {
                fullName: "Test Slot Sync Collector 2",
                phone: "0900000124",
                role: "SAMPLE_COLLECTOR",
                active: true
            }
        });
        collector2Id = newCollector.id;
    }

    await prisma.collectorWorkingSchedule.create({
        data: {
            staffProfileId: testCollectorId,
            workDate: today,
            startTime: "09:00",
            endTime: "10:00",
            active: true,
            capacity: 8
        }
    });

    await prisma.collectorWorkingSchedule.create({
        data: {
            staffProfileId: collector2Id,
            workDate: today,
            startTime: "09:00",
            endTime: "10:00",
            active: true,
            capacity: 8
        }
    });

    console.log(`Created 2 collector schedules for ${multiDateStr} 09:00-10:00`);

    const scheduleGroups = await syncService.getCollectorScheduleGroups(today);

    console.log(`Schedule groups for ${multiDateStr}:`);
    for (const group of scheduleGroups) {
        console.log(`  - ${group.startTime}-${group.endTime}: capacity=${group.capacity}, collectors=${group.collectors.length}`);
    }

    const result = await syncService.syncAvailabilitySlotsForDate(multiDateStr);

    console.log(`Sync result:`, JSON.stringify(result, null, 2));

    const queryDate = new Date(Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate()
    ));

    console.log(`Querying slots for date: ${queryDate.toISOString()}`);

    const allSlots = await prisma.availabilitySlot.findMany({
        where: {
            date: queryDate
        }
    });

    console.log(`All slots found: ${allSlots.length}`);
    for (const slot of allSlots) {
        const utcHours = String(slot.startTime.getUTCHours()).padStart(2, "0");
        const utcMinutes = String(slot.startTime.getUTCMinutes()).padStart(2, "0");
        console.log(`  - Slot ${slot.id}: ${slot.date.toISOString().slice(0, 10)} ${utcHours}:${utcMinutes} UTC, capacity=${slot.capacity}`);
    }

    const slots = allSlots;

    const targetSlot = slots.find(s => {
        const utcHours = String(s.startTime.getUTCHours()).padStart(2, "0");
        const utcMinutes = String(s.startTime.getUTCMinutes()).padStart(2, "0");
        const timeStart = `${utcHours}:${utcMinutes}`;
        return timeStart === "09:00";
    });

    if (!targetSlot) {
        throw new Error(`Expected slot 09:00 not found. Available slots: ${slots.map(s => {
            const utcHours = String(s.startTime.getUTCHours()).padStart(2, "0");
            const utcMinutes = String(s.startTime.getUTCMinutes()).padStart(2, "0");
            return `${utcHours}:${utcMinutes}`;
        }).join(", ")}`);
    }

    if (targetSlot.capacity !== 2) {
        throw new Error(`Expected capacity=2 (2 collectors), got ${targetSlot.capacity}`);
    }

    console.log(`✅ TEST 5 PASSED: Capacity correctly set to ${targetSlot.capacity} based on 2 collectors`);
}

async function cleanup() {
    console.log("\n=== CLEANUP ===");

    await prisma.collectorWorkingSchedule.deleteMany({
        where: {
            staffProfileId: testCollectorId
        }
    });

    await prisma.collectorWorkingSchedule.deleteMany({
        where: {
            staffProfileId: testCollectorId
        }
    });

    await prisma.collectorWorkingSchedule.deleteMany({
        where: {
            staffProfileId: testCollectorId
        }
    });

    const collector2 = await prisma.staffProfile.findFirst({
        where: {
            phone: "0900000124",
            role: "SAMPLE_COLLECTOR"
        }
    });

    if (collector2) {
        await prisma.collectorWorkingSchedule.deleteMany({
            where: {
                staffProfileId: collector2.id
            }
        });
    }

    await prisma.availabilitySlot.deleteMany({
        where: {
            date: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
        }
    });

    console.log("Cleanup complete");
}

async function runAllTests() {
    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };

    const tests = [
        { name: "TEST 1: Sync availability from collectors", fn: test1_SyncAvailabilityFromCollectors },
        { name: "TEST 2: Orphaned slot cleanup", fn: test2_OrphanedSlotCleanup },
        { name: "TEST 3: Past slot filter", fn: test3_PastSlotFilter },
        { name: "TEST 4: Slot status classification", fn: test4_SlotStatusClassification },
        { name: "TEST 5: Capacity based on collectors", fn: test5_CapacityBasedOnCollectors }
    ];

    try {
        await setupTestCollector();

        for (const test of tests) {
            try {
                await test.fn();
                results.passed++;
                results.tests.push({ name: test.name, status: "PASSED" });
            } catch (error) {
                results.failed++;
                results.tests.push({ name: test.name, status: "FAILED", error: error.message });
                console.error(`❌ ${test.name} FAILED:`, error.message);
            }
        }
    } finally {
        await cleanup();
    }

    console.log("\n=== SUMMARY ===");
    console.log(`Total: ${results.tests.length}`);
    console.log(`Passed: ${results.passed}`);
    console.log(`Failed: ${results.failed}`);

    for (const test of results.tests) {
        console.log(`  ${test.status === "PASSED" ? "✅" : "❌"} ${test.name}`);
        if (test.error) {
            console.log(`     Error: ${test.error}`);
        }
    }

    if (results.failed > 0) {
        process.exit(1);
    }

    console.log("\n✅ ALL TESTS PASSED");
    await prisma.$disconnect();
}

runAllTests().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
});
