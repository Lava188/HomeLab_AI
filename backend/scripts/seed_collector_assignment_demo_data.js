/**
 * Seed script for collector assignment demo data
 *
 * This script creates demo data to test the auto collector assignment flow:
 * - Creates active SAMPLE_COLLECTOR staff profiles
 * - Creates working areas matching "766 Đê La Thành, Đống Đa, Hà Nội"
 * - Creates working schedules for the next 7 days
 * - Creates availability slots for common time slots
 *
 * Usage:
 *   node backend/scripts/seed_collector_assignment_demo_data.js
 *   node backend/scripts/seed_collector_assignment_demo_data.js --verify
 *
 * @remark This script is idempotent - running multiple times will not create duplicates.
 */

const path = require("path");
const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
process.chdir(PROJECT_ROOT);

const prisma = require("../src/services/booking-runtime/prisma-client");

// Demo data markers for easy identification
const DEMO_MARKERS = {
    fullName: "Demo Collector Auto Assignment",
    serviceArea: "AUTO_ASSIGNMENT_DEMO",
    phonePrefix: "9988", // Distinct prefix for demo collectors
    metadata: { seededBy: "seed_collector_assignment_demo_data.js" }
};

// Demo working areas - matching "766 Đê La Thành, Đống Đa, Hà Nội"
const DEMO_WORKING_AREAS = [
    {
        province: "Hà Nội",
        district: "Đống Đa",
        ward: null, // District-level match is sufficient
        active: true
    }
];

// Time slots for working schedules and availability
const DEMO_TIME_SLOTS = [
    { start: "08:00", end: "12:00" },
    { start: "13:00", end: "17:00" },
    { start: "08:30", end: "09:30" },
    { start: "09:30", end: "10:30" }
];

// Number of days to create schedules for
const SCHEDULE_DAYS = 7;

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

function generatePhone(suffix) {
    return `${DEMO_MARKERS.phonePrefix}${String(suffix).padStart(4, "0")}`;
}

/**
 * Check if a staff profile is a demo collector created by this script
 */
function isDemoCollector(collector) {
    return collector &&
        collector.fullName === DEMO_MARKERS.fullName &&
        collector.phone &&
        collector.phone.startsWith(DEMO_MARKERS.phonePrefix);
}

/**
 * Seed or update demo collectors
 */
async function seedDemoCollectors() {
    console.log("\n=== Seeding Demo Collectors ===");

    const collectors = [];

    // Create 2 demo collectors with different capacity preferences
    const demoCollectorConfigs = [
        {
            phone: generatePhone(1),
            name: DEMO_MARKERS.fullName,
            role: "SAMPLE_COLLECTOR",
            active: true,
            serviceArea: "Hà Nội - Đống Đa - AUTO_ASSIGNMENT_DEMO"
        },
        {
            phone: generatePhone(2),
            name: `${DEMO_MARKERS.fullName} (Alt)`,
            role: "SAMPLE_COLLECTOR",
            active: true,
            serviceArea: "Hà Nội - Quận Hoàn Kiếm - AUTO_ASSIGNMENT_DEMO"
        }
    ];

    for (const config of demoCollectorConfigs) {
        // Check if demo collector already exists
        let collector = await prisma.staffProfile.findFirst({
            where: {
                phone: config.phone
            }
        });

        if (collector) {
            console.log(`✓ Found existing demo collector: ${collector.fullName} (${collector.phone})`);
            // Update if needed
            if (collector.active !== config.active || collector.role !== config.role) {
                collector = await prisma.staffProfile.update({
                    where: { id: collector.id },
                    data: {
                        active: config.active,
                        role: config.role
                    }
                });
                console.log(`  Updated collector: ${collector.fullName}`);
            }
        } else {
            collector = await prisma.staffProfile.create({
                data: {
                    fullName: config.name,
                    phone: config.phone,
                    role: config.role,
                    active: config.active,
                    serviceArea: config.serviceArea
                }
            });
            console.log(`✓ Created new demo collector: ${collector.fullName} (${collector.phone})`);
        }

        collectors.push(collector);
    }

    return collectors;
}

/**
 * Seed working areas for demo collectors
 */
async function seedWorkingAreas(collectors) {
    console.log("\n=== Seeding Working Areas ===");

    const areas = [];

    for (const collector of collectors) {
        for (const areaConfig of DEMO_WORKING_AREAS) {
            // Check if working area already exists
            let area = await prisma.collectorWorkingArea.findFirst({
                where: {
                    staffProfileId: collector.id,
                    province: areaConfig.province,
                    district: areaConfig.district,
                    ward: areaConfig.ward || null
                }
            });

            if (area) {
                console.log(`✓ Found existing working area for ${collector.fullName}: ${areaConfig.province}, ${areaConfig.district}`);
                // Update if needed
                if (!area.active) {
                    area = await prisma.collectorWorkingArea.update({
                        where: { id: area.id },
                        data: { active: true }
                    });
                    console.log(`  Activated working area`);
                }
            } else {
                area = await prisma.collectorWorkingArea.create({
                    data: {
                        staffProfileId: collector.id,
                        province: areaConfig.province,
                        district: areaConfig.district,
                        ward: areaConfig.ward,
                        active: areaConfig.active
                    }
                });
                console.log(`✓ Created working area for ${collector.fullName}: ${areaConfig.province}, ${areaConfig.district}`);
            }

            areas.push(area);
        }
    }

    return areas;
}

/**
 * Seed working schedules for demo collectors
 */
async function seedWorkingSchedules(collectors) {
    console.log("\n=== Seeding Working Schedules ===");

    const schedules = [];
    let createdCount = 0;
    let existingCount = 0;

    for (const collector of collectors) {
        for (let dayOffset = 0; dayOffset < SCHEDULE_DAYS; dayOffset++) {
            const workDate = getDateWithOffset(dayOffset);
            const dateStr = formatDateOnly(workDate);

            for (const timeSlot of DEMO_TIME_SLOTS) {
                // Check if schedule already exists
                let schedule = await prisma.collectorWorkingSchedule.findFirst({
                    where: {
                        staffProfileId: collector.id,
                        workDate: workDate,
                        startTime: timeSlot.start,
                        endTime: timeSlot.end
                    }
                });

                if (schedule) {
                    if (!schedule.active) {
                        schedule = await prisma.collectorWorkingSchedule.update({
                            where: { id: schedule.id },
                            data: { active: true }
                        });
                        createdCount++;
                    }
                    existingCount++;
                } else {
                    schedule = await prisma.collectorWorkingSchedule.create({
                        data: {
                            staffProfileId: collector.id,
                            workDate: workDate,
                            startTime: timeSlot.start,
                            endTime: timeSlot.end,
                            capacity: 8,
                            active: true
                        }
                    });
                    createdCount++;
                }

                schedules.push(schedule);
            }
        }
    }

    console.log(`✓ Working schedules: ${createdCount} created/updated, ${existingCount} already exist`);

    return schedules;
}

/**
 * Seed availability slots
 */
async function seedAvailabilitySlots() {
    console.log("\n=== Seeding Availability Slots ===");

    const slots = [];
    let createdCount = 0;
    let existingCount = 0;

    for (let dayOffset = 0; dayOffset < SCHEDULE_DAYS; dayOffset++) {
        const date = getDateWithOffset(dayOffset);

        for (const timeSlot of DEMO_TIME_SLOTS) {
            const [startHour, startMin] = timeSlot.start.split(":").map(Number);
            const [endHour, endMin] = timeSlot.end.split(":").map(Number);

            const startTime = new Date(Date.UTC(1970, 0, 1, startHour, startMin, 0));
            const endTime = new Date(Date.UTC(1970, 0, 1, endHour, endMin, 0));

            // Check if slot already exists
            let slot = await prisma.availabilitySlot.findFirst({
                where: {
                    date: date,
                    startTime: startTime,
                    endTime: endTime,
                    area: { contains: "Hà Nội" }
                }
            });

            if (slot) {
                if (!slot.active) {
                    slot = await prisma.availabilitySlot.update({
                        where: { id: slot.id },
                        data: {
                            active: true,
                            capacity: Math.max(slot.capacity, 10)
                        }
                    });
                    createdCount++;
                }
                existingCount++;
            } else {
                slot = await prisma.availabilitySlot.create({
                    data: {
                        date: date,
                        startTime: startTime,
                        endTime: endTime,
                        capacity: 10,
                        bookedCount: 0,
                        area: "Hà Nội - Đống Đa",
                        active: true
                    }
                });
                createdCount++;
            }

            slots.push(slot);
        }
    }

    console.log(`✓ Availability slots: ${createdCount} created/updated, ${existingCount} already exist`);

    return slots;
}

/**
 * Verify demo data is ready for matching
 */
async function verifyDemoData(collectors) {
    console.log("\n=== Verifying Demo Data ===");

    const tomorrow = getDateWithOffset(1);
    const tomorrowStr = formatDateOnly(tomorrow);

    const demoCollector = collectors[0];

    // Check working areas
    const workingAreas = await prisma.collectorWorkingArea.findMany({
        where: {
            staffProfileId: demoCollector.id,
            active: true
        }
    });
    console.log(`✓ Collector has ${workingAreas.length} active working areas`);

    // Check working schedules for tomorrow
    const tomorrowSchedules = await prisma.collectorWorkingSchedule.findMany({
        where: {
            staffProfileId: demoCollector.id,
            workDate: tomorrow,
            active: true
        }
    });
    console.log(`✓ Collector has ${tomorrowSchedules.length} active working schedules for ${tomorrowStr}`);

    // Check availability slots for tomorrow
    const tomorrowSlots = await prisma.availabilitySlot.findMany({
        where: {
            date: tomorrow,
            active: true,
            area: { contains: "Hà Nội" }
        }
    });
    console.log(`✓ Found ${tomorrowSlots.length} availability slots for ${tomorrowStr} (Hà Nội area)`);

    // Print matching test case
    console.log("\n=== Test Case for Matching ===");
    console.log(`Address: "766 Đê La Thành, Đống Đa, Hà Nội"`);
    console.log(`Expected province match: Hà Nội`);
    console.log(`Expected district match: Đống Đa`);
    console.log(`Collector working areas:`);
    for (const area of workingAreas) {
        console.log(`  - ${area.province}, ${area.district}, ${area.ward || "no ward"}`);
    }

    return {
        workingAreaCount: workingAreas.length,
        scheduleCount: tomorrowSchedules.length,
        slotCount: tomorrowSlots.length,
        isReady: workingAreas.length > 0 && tomorrowSchedules.length > 0
    };
}

/**
 * Print summary and test instructions
 */
function printSummary(collectors, areas, schedules, slots, verification) {
    console.log("\n=== Summary ===");
    console.log(`Demo collectors: ${collectors.length}`);
    console.log(`Working areas: ${areas.length}`);
    console.log(`Working schedules (next ${SCHEDULE_DAYS} days): ${schedules.length}`);
    console.log(`Availability slots (next ${SCHEDULE_DAYS} days): ${slots.length}`);
    console.log(`\nDemo data status: ${verification.isReady ? "✓ READY" : "✗ NOT READY"}`);

    console.log("\n=== How to Test on UI ===");
    console.log(`1. Open chatbot interface`);
    console.log(`2. Chat: "tôi muốn đặt lịch xét nghiệm ngày mai"`);
    console.log(`3. Select: "gán chức năng gan" or any test package`);
    console.log(`4. Select time slot: 08:30 or 09:30`);
    console.log(`5. Enter address: "766 Đê La Thành, Đống Đa, Hà Nội"`);
    console.log(`6. Enter name: "Test Patient"`);
    console.log(`7. Confirm booking`);

    console.log("\n=== Expected Result After Booking ===");
    console.log(`After booking is confirmed, check:`);
    console.log(`1. Booking table: status should be CONFIRMED`);
    console.log(`2. CollectorAssignment table:`);
    console.log(`   - source = AUTO`);
    console.log(`   - status = PENDING_COLLECTOR_CONFIRMATION`);
    console.log(`   - collectorId = one of the demo collectors`);
    console.log(`3. CollectorAssignmentHistory table:`);
    console.log(`   - toStatus = PENDING_COLLECTOR_CONFIRMATION`);
    console.log(`   - actorType = SYSTEM`);
    console.log(`   - reason = AUTO_ASSIGNMENT_CREATED`);

    console.log("\n=== Demo Collectors ===");
    for (const collector of collectors) {
        console.log(`- ${collector.fullName} (${collector.phone})`);
        console.log(`  Service area: ${collector.serviceArea}`);
    }

    console.log("\n=== Time Slots Created ===");
    console.log(`For the next ${SCHEDULE_DAYS} days, these time slots are available:`);
    for (const slot of DEMO_TIME_SLOTS) {
        console.log(`- ${slot.start} - ${slot.end}`);
    }

    console.log("\n=== SQL to Check Assignment ===");
    console.log(`-- Check if assignment was created after booking`);
    console.log(`SELECT * FROM CollectorAssignment ORDER BY createdAt DESC LIMIT 5;`);
    console.log(`-- Check assignment history`);
    console.log(`SELECT * FROM CollectorAssignmentHistory ORDER BY createdAt DESC LIMIT 5;`);
}

/**
 * Main seed function
 */
async function main() {
    const args = process.argv.slice(2);
    const verifyOnly = args.includes("--verify");

    console.log("=== Collector Assignment Demo Data Seed ===");
    console.log(`Date: ${new Date().toISOString()}`);

    try {
        // Check if we're in verify-only mode
        if (verifyOnly) {
            console.log("\n=== Verify Mode ===");
            const collectors = await prisma.staffProfile.findMany({
                where: {
                    phone: { startsWith: DEMO_MARKERS.phonePrefix }
                }
            });

            if (collectors.length === 0) {
                console.log("✗ No demo collectors found. Run seed script first.");
                return;
            }

            const verification = await verifyDemoData(collectors);
            printSummary(collectors, [], [], [], verification);
            return;
        }

        // Seed data
        const collectors = await seedDemoCollectors();
        const areas = await seedWorkingAreas(collectors);
        const schedules = await seedWorkingSchedules(collectors);
        const slots = await seedAvailabilitySlots();

        // Verify
        const verification = await verifyDemoData(collectors);

        // Print summary
        printSummary(collectors, areas, schedules, slots, verification);

        console.log("\n=== Seed Complete ===");

    } catch (error) {
        console.error("\n=== Seed Failed ===");
        console.error(error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
