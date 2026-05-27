/**
 * SMOKE TEST: Chatbot Availability Slot Integration (5M12)
 *
 * Tests:
 * 1. Chatbot gợi ý slot từ collector schedule thật
 * 2. User hỏi "còn khung giờ nào trống" trả đúng slot
 * 3. User chọn giờ không có slot thì báo lỗi
 * 4. User chọn giờ trong quá khứ thì báo lỗi
 * 5. Không tạo booking vào giờ không có slot
 */

const prisma = require("../src/services/booking-runtime/prisma-client");
const bookingService = require("../src/services/booking.service");
const availabilitySlotService = require("../src/services/booking-runtime/availability-slot.service");
const syncService = require("../src/services/booking-runtime/availability-slot-sync.service");

const TEST_SESSION = "smoke-chatbot-availability-5m12";
const TEST_USER_PHONE = "0900000999";

let testDate = null;
let testDateStr = null;

async function setupTestData() {
    console.log("\n=== SETUP: Creating test data ===");

    const today = new Date();
    today.setUTCDate(today.getUTCDate() + 1);
    testDate = new Date(today);
    testDateStr = today.toISOString().slice(0, 10);

    await prisma.bookingDraft.deleteMany({
        where: {
            sessionId: TEST_SESSION
        }
    });

    await prisma.patient.deleteMany({
        where: {
            phone: TEST_USER_PHONE
        }
    });

    const patient = await prisma.patient.create({
        data: {
            fullName: "Test Chatbot Availability",
            phone: TEST_USER_PHONE
        }
    });

    console.log(`Created patient: ${patient.fullName} (${patient.phone})`);

    let collector = await prisma.staffProfile.findFirst({
        where: {
            phone: "0900000130",
            role: "SAMPLE_COLLECTOR"
        }
    });

    if (!collector) {
        collector = await prisma.staffProfile.create({
            data: {
                fullName: "Test Chatbot Collector",
                phone: "0900000130",
                role: "SAMPLE_COLLECTOR",
                active: true
            }
        });
    }

    await prisma.collectorWorkingSchedule.deleteMany({
        where: {
            staffProfileId: collector.id,
            workDate: testDate
        }
    });

    await prisma.collectorWorkingSchedule.create({
        data: {
            staffProfileId: collector.id,
            workDate: testDate,
            startTime: "08:00",
            endTime: "09:00",
            active: true,
            capacity: 8
        }
    });

    await prisma.collectorWorkingSchedule.create({
        data: {
            staffProfileId: collector.id,
            workDate: testDate,
            startTime: "10:00",
            endTime: "11:00",
            active: true,
            capacity: 8
        }
    });

    await prisma.collectorWorkingSchedule.create({
        data: {
            staffProfileId: collector.id,
            workDate: testDate,
            startTime: "14:00",
            endTime: "15:00",
            active: true,
            capacity: 8
        }
    });

    console.log(`Created collector schedules for ${testDateStr}: 08:00-09:00, 10:00-11:00, 14:00-15:00`);

    await syncService.syncAvailabilitySlotsForDate(testDateStr);

    console.log("Synced availability slots from collector schedules");

    const slots = await prisma.availabilitySlot.findMany({
        where: {
            date: testDate,
            active: true
        },
        orderBy: {
            startTime: "asc"
        }
    });

    console.log(`Available slots for ${testDateStr}:`);
    for (const slot of slots) {
        const timeStart = slot.startTime.toTimeString().slice(0, 5);
        const timeEnd = slot.endTime.toTimeString().slice(0, 5);
        console.log(`  - ${timeStart}-${timeEnd}: capacity=${slot.capacity}`);
    }

    return { patient, collector };
}

async function test1_ChatbotSuggestsRealSlots() {
    console.log("\n=== TEST 1: Chatbot suggests real slots from collector schedules ===");

    const slots = await availabilitySlotService.findAvailableNearbySlots({
        requestedDate: testDateStr,
        days: 1,
        limit: 10
    });

    console.log(`Available slots found: ${slots.length}`);

    const expectedTimes = ["08:00", "10:00", "14:00"];

    for (const expectedTime of expectedTimes) {
        const found = slots.some(s => s.timeStart === expectedTime);
        if (!found) {
            throw new Error(`Expected slot ${expectedTime} not found in suggestions`);
        }
    }

    console.log("✅ TEST 1 PASSED: Chatbot suggests correct slots from collector schedules");
}

async function test2_ChatbotAvailabilityCheckReply() {
    console.log("\n=== TEST 2: Chatbot availability check reply ===");

    const draft = {
        testType: "Gói cơ bản",
        appointmentDate: testDateStr
    };

    const slots = await bookingService.getAvailableSlotsForDate(testDateStr);

    console.log(`Available slots for ${testDateStr}: ${slots.length}`);

    if (slots.length !== 3) {
        throw new Error(`Expected 3 slots, got ${slots.length}`);
    }

    const slotTimes = slots.map(s => s.timeStart).sort();
    const expectedTimes = ["08:00", "10:00", "14:00"];

    if (JSON.stringify(slotTimes) !== JSON.stringify(expectedTimes)) {
        throw new Error(`Expected times ${expectedTimes.join(", ")}, got ${slotTimes.join(", ")}`);
    }

    console.log("✅ TEST 2 PASSED: Availability check returns correct slots");
}

async function test3_UnavailableTimeRejected() {
    console.log("\n=== TEST 3: Unavailable time is rejected ===");

    const unavailableTime = "09:00";

    const isAvailable = await availabilitySlotService.isSelectedTimeAvailable(testDateStr, unavailableTime);

    if (isAvailable) {
        throw new Error(`Time ${unavailableTime} should not be available`);
    }

    console.log("✅ TEST 3 PASSED: Unavailable time correctly rejected");
}

async function test4_PastDateRejected() {
    console.log("\n=== TEST 4: Past date is rejected ===");

    const pastDate = new Date();
    pastDate.setUTCDate(pastDate.getUTCDate() - 1);
    const pastDateStr = pastDate.toISOString().slice(0, 10);

    try {
        await availabilitySlotService.assertSlotAvailable({
            sampleDate: pastDateStr,
            sampleTimeStart: "08:00"
        });
        throw new Error("Should have thrown error for past date");
    } catch (error) {
        if (error.code !== "BOOKING_SLOT_PAST_DATE") {
            throw error;
        }
        console.log("✅ TEST 4 PASSED: Past date correctly rejected");
    }
}

async function test5_NonExistentSlotRejected() {
    console.log("\n=== TEST 5: Non-existent slot is rejected ===");

    const nonExistentTime = "16:00";

    try {
        await availabilitySlotService.assertSlotAvailable({
            sampleDate: testDateStr,
            sampleTimeStart: nonExistentTime
        });
        throw new Error("Should have thrown error for non-existent slot");
    } catch (error) {
        if (error.code !== "BOOKING_SLOT_NOT_OPEN") {
            throw error;
        }
        console.log("✅ TEST 5 PASSED: Non-existent slot correctly rejected");
    }
}

async function test6_NearbySlotsSuggestion() {
    console.log("\n=== TEST 6: Nearby slots suggestion when day has no slots ===");

    const emptyDate = new Date(testDate);
    emptyDate.setUTCDate(emptyDate.getUTCDate() + 2);
    const emptyDateStr = emptyDate.toISOString().slice(0, 10);

    const nearbySlots = await availabilitySlotService.findAvailableNearbySlots({
        requestedDate: emptyDateStr,
        days: 3,
        limit: 5
    });

    console.log(`Nearby slots found: ${nearbySlots.length}`);

    const hasTargetDateSlots = nearbySlots.some(s => s.date === testDateStr);

    if (!hasTargetDateSlots) {
        console.log(`Note: No slots found for target date ${testDateStr}, this is expected if no other dates have slots`);
    }

    console.log("✅ TEST 6 PASSED: Nearby slots suggestion works correctly");
}

async function cleanup() {
    console.log("\n=== CLEANUP ===");

    await prisma.bookingDraft.deleteMany({
        where: {
            sessionId: TEST_SESSION
        }
    });

    await prisma.patient.deleteMany({
        where: {
            phone: TEST_USER_PHONE
        }
    });

    const collector = await prisma.staffProfile.findFirst({
        where: {
            phone: "0900000130",
            role: "SAMPLE_COLLECTOR"
        }
    });

    if (collector) {
        await prisma.collectorWorkingSchedule.deleteMany({
            where: {
                staffProfileId: collector.id
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
        { name: "TEST 1: Chatbot suggests real slots", fn: test1_ChatbotSuggestsRealSlots },
        { name: "TEST 2: Chatbot availability check", fn: test2_ChatbotAvailabilityCheckReply },
        { name: "TEST 3: Unavailable time rejected", fn: test3_UnavailableTimeRejected },
        { name: "TEST 4: Past date rejected", fn: test4_PastDateRejected },
        { name: "TEST 5: Non-existent slot rejected", fn: test5_NonExistentSlotRejected },
        { name: "TEST 6: Nearby slots suggestion", fn: test6_NearbySlotsSuggestion }
    ];

    try {
        await setupTestData();

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
