/**
 * Smoke test for collector assignment demo seed
 *
 * This script verifies that the demo data is ready for the auto assignment flow.
 * It does NOT create actual bookings/assignments, only checks matching conditions.
 *
 * Usage:
 *   node backend/scripts/smoke_collector_assignment_demo_seed.js
 *
 * @remark This is a verification script only - no side effects on DB.
 */

const path = require("path");
const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
process.chdir(PROJECT_ROOT);

const prisma = require("../src/services/booking-runtime/prisma-client");
const collectorMatching = require("../src/services/collector-assignment/collector-matching.service");

// Demo data markers
const DEMO_MARKERS = {
    fullName: "Demo Collector Auto Assignment",
    phonePrefix: "9988"
};

// Test address matching "766 Đê La Thành, Đống Đa, Hà Nội"
const TEST_ADDRESSES = [
    "766 Đê La Thành, Đống Đa, Hà Nội",
    "123 Nguyễn Lương, Đống Đa, Hà Nội",
    "456 Giải Phóng, Đống Đa, Hà Nội"
];

function formatDateOnly(date) {
    const d = new Date(date);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function formatTimeOnly(date) {
    const d = new Date(date);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function getDateWithOffset(offsetDays = 0) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date;
}

function timeValue(hour, minute) {
    return new Date(Date.UTC(1970, 0, 1, hour, minute, 0));
}

/**
 * Check if demo collectors exist
 */
async function checkDemoCollectors() {
    console.log("\n=== Checking Demo Collectors ===");

    const collectors = await prisma.staffProfile.findMany({
        where: {
            phone: { startsWith: DEMO_MARKERS.phonePrefix }
        }
    });

    console.log(`Found ${collectors.length} demo collectors`);
    for (const collector of collectors) {
        console.log(`✓ ${collector.fullName} (${collector.phone}) - active: ${collector.active}`);
    }

    return collectors;
}

/**
 * Check working areas for demo collectors
 */
async function checkWorkingAreas(collectors) {
    console.log("\n=== Checking Working Areas ===");

    for (const collector of collectors) {
        const areas = await prisma.collectorWorkingArea.findMany({
            where: {
                staffProfileId: collector.id,
                active: true
            }
        });

        console.log(`${collector.fullName} has ${areas.length} active working areas:`);
        for (const area of areas) {
            console.log(`  ✓ ${area.province}, ${area.district}, ${area.ward || "no ward"}`);
        }
    }

    return true;
}

/**
 * Check working schedules for demo collectors
 */
async function checkWorkingSchedules(collectors) {
    console.log("\n=== Checking Working Schedules ===");

    const tomorrow = getDateWithOffset(1);
    const tomorrowStr = formatDateOnly(tomorrow);

    for (const collector of collectors) {
        const schedules = await prisma.collectorWorkingSchedule.findMany({
            where: {
                staffProfileId: collector.id,
                workDate: tomorrow,
                active: true
            }
        });

        console.log(`${collector.fullName} has ${schedules.length} schedules for ${tomorrowStr}:`);
        for (const schedule of schedules) {
            console.log(`  ✓ ${schedule.startTime} - ${schedule.endTime} (capacity: ${schedule.capacity})`);
        }
    }

    return true;
}

/**
 * Test address parsing
 */
async function testAddressParsing() {
    console.log("\n=== Testing Address Parsing ===");

    const { parseVietnameseAddress } = collectorMatching;

    for (const address of TEST_ADDRESSES) {
        const parsed = parseVietnameseAddress(address);
        console.log(`Address: "${address}"`);
        console.log(`  Province: ${parsed.province || "none"}`);
        console.log(`  District: ${parsed.district || "none"}`);
        console.log(`  Ward: ${parsed.ward || "none"}`);
        console.log(`  Confidence: ${parsed.confidence}`);
    }

    return true;
}

/**
 * Test collector matching for a hypothetical booking
 */
async function testCollectorMatching(collectors) {
    console.log("\n=== Testing Collector Matching ===");

    const tomorrow = getDateWithOffset(1);
    const testBooking = {
        id: "HYPOTHETICAL_BOOKING_ID",
        bookingCode: "HLB-TEST-DEMO",
        sampleDate: tomorrow,
        sampleTimeStart: timeValue(9, 0),
        address: "766 Đê La Thành, Đống Đa, Hà Nội"
    };

    console.log(`Test booking:`);
    console.log(`  Date: ${formatDateOnly(testBooking.sampleDate)}`);
    console.log(`  Time: ${formatTimeOnly(testBooking.sampleTimeStart)}`);
    console.log(`  Address: ${testBooking.address}`);

    const result = await collectorMatching.findCollectorCandidatesForBooking(
        testBooking,
        { includeDebug: true }
    );

    console.log(`\nMatching result:`);
    console.log(`  Candidates found: ${result.candidates.length}`);
    console.log(`  Warnings: ${result.warnings.length}`);

    if (result.candidates.length > 0) {
        console.log(`\nTop candidate:`);
        const top = result.candidates[0];
        console.log(`  Collector: ${top.collectorName} (${top.collectorPhone})`);
        console.log(`  Score: ${top.score}`);
        console.log(`  Reasons: ${top.reasons.join(", ")}`);
        if (top.warnings.length > 0) {
            console.log(`  Warnings: ${top.warnings.join(", ")}`);
        }
        console.log(`  Area match: ${top.areaMatch.level}`);
        console.log(`  Schedule match: ${top.scheduleMatch.matched}`);
    }

    if (result.warnings.length > 0) {
        console.log(`\nWarnings:`);
        for (const warning of result.warnings) {
            console.log(`  - ${warning}`);
        }
    }

    if (result.debug) {
        console.log(`\nDebug info:`);
        console.log(`  Total collectors checked: ${result.debug.totalCollectors || "unknown"}`);
        if (result.debug.excludedCollectors) {
            console.log(`  Excluded collectors: ${result.debug.excludedCollectors.length}`);
            for (const excluded of result.debug.excludedCollectors) {
                console.log(`    - ${excluded.collectorName}: ${excluded.reason}`);
            }
        }
    }

    return result.candidates.length > 0;
}

/**
 * Verify availability slots
 */
async function checkAvailabilitySlots() {
    console.log("\n=== Checking Availability Slots ===");

    const tomorrow = getDateWithOffset(1);
    const tomorrowStr = formatDateOnly(tomorrow);

    const slots = await prisma.availabilitySlot.findMany({
        where: {
            date: tomorrow,
            active: true,
            area: { contains: "Hà Nội" }
        }
    });

    console.log(`Found ${slots.length} availability slots for ${tomorrowStr} (Hà Nội):`);
    for (const slot of slots) {
        console.log(`  ✓ ${formatTimeOnly(slot.startTime)} - ${formatTimeOnly(slot.endTime)} (capacity: ${slot.capacity}, booked: ${slot.bookedCount})`);
    }

    return slots.length > 0;
}

/**
 * Main verification function
 */
async function main() {
    console.log("=== Smoke Test: Collector Assignment Demo Seed ===");
    console.log(`Date: ${new Date().toISOString()}`);

    try {
        // Check demo collectors
        const collectors = await checkDemoCollectors();
        if (collectors.length === 0) {
            console.error("\n✗ FAILED: No demo collectors found. Run seed script first:");
            console.error("  node backend/scripts/seed_collector_assignment_demo_data.js");
            process.exit(1);
        }

        // Check working areas
        await checkWorkingAreas(collectors);

        // Check working schedules
        await checkWorkingSchedules(collectors);

        // Check availability slots
        await checkAvailabilitySlots();

        // Test address parsing
        await testAddressParsing();

        // Test collector matching
        const matchingPassed = await testCollectorMatching(collectors);

        // Summary
        console.log("\n=== Summary ===");
        console.log(`Demo collectors: ${collectors.length}`);
        console.log(`Address parsing: ✓`);
        console.log(`Collector matching: ${matchingPassed ? "✓" : "✗"}`);

        if (matchingPassed) {
            console.log("\n✓ PASSED: Demo data is ready for auto assignment testing");
        } else {
            console.log("\n✗ FAILED: Collector matching did not find candidates");
            process.exit(1);
        }

    } catch (error) {
        console.error("\n=== Smoke Test Failed ===");
        console.error(error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
