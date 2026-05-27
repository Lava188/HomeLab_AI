const syncService = require("../src/services/booking-runtime/availability-slot-sync.service");
const prisma = require("../src/services/booking-runtime/prisma-client");

async function main() {
    console.log("=== Rebuild Availability Slots from Collector Schedules ===\n");

    const args = process.argv.slice(2);
    const command = args[0] || "sync-next-7";

    try {
        switch (command) {
            case "sync-date": {
                const dateArg = args[1];
                if (!dateArg) {
                    console.error("Usage: node rebuild_availability_slots_from_collectors.js sync-date YYYY-MM-DD");
                    process.exit(1);
                }

                console.log(`Syncing availability slots for date: ${dateArg}`);
                const result = await syncService.syncAvailabilitySlotsForDate(dateArg);
                console.log(JSON.stringify(result, null, 2));
                break;
            }

            case "sync-range": {
                const dateFrom = args[1];
                const dateTo = args[2];

                if (!dateFrom || !dateTo) {
                    console.error("Usage: node rebuild_availability_slots_from_collectors.js sync-range YYYY-MM-DD YYYY-MM-DD");
                    process.exit(1);
                }

                console.log(`Syncing availability slots from ${dateFrom} to ${dateTo}`);
                const result = await syncService.syncAvailabilitySlotsForDateRange(dateFrom, dateTo);
                console.log(JSON.stringify(result, null, 2));
                break;
            }

            case "sync-next-7":
            case "sync-next": {
                const days = parseInt(args[1] || "7", 10);
                console.log(`Syncing availability slots for next ${days} days`);
                const result = await syncService.syncAvailabilitySlotsForNextDays(days);
                console.log(JSON.stringify(result, null, 2));
                break;
            }

            case "disable-past": {
                console.log("Disabling past availability slots...");
                const result = await syncService.disablePastAvailabilitySlots();
                console.log(JSON.stringify(result, null, 2));
                break;
            }

            case "cleanup": {
                console.log("Cleaning up orphaned availability slots...");

                const today = new Date();
                today.setUTCHours(0, 0, 0, 0);

                const allSlots = await prisma.availabilitySlot.findMany({
                    where: {
                        date: {
                            gte: today
                        },
                        active: true
                    },
                    select: {
                        id: true,
                        date: true,
                        startTime: true,
                        endTime: true,
                        capacity: true
                    }
                });

                let disabledCount = 0;

                for (const slot of allSlots) {
                    const scheduleGroups = await syncService.getCollectorScheduleGroups(slot.date);

                    const hasMatch = scheduleGroups.some(group => {
                        const slotTime = slot.startTime.toTimeString().slice(0, 5);
                        return slotTime === group.startTime;
                    });

                    if (!hasMatch) {
                        await prisma.availabilitySlot.update({
                            where: { id: slot.id },
                            data: { active: false }
                        });
                        disabledCount++;
                        console.log(`Disabled slot: ${slot.date.toISOString().slice(0, 10)} ${slot.startTime.toTimeString().slice(0, 5)} - ${slot.endTime.toTimeString().slice(0, 5)}`);
                    }
                }

                console.log(`\nCleanup complete. Disabled ${disabledCount} orphaned slots.`);
                break;
            }

            case "reset-all": {
                console.warn("\n⚠️  DANGER: This will DISABLE ALL availability slots!");
                console.warn("This operation cannot be easily undone.\n");

                const confirm = args[1];
                if (confirm !== "YES_I_AM_SURE") {
                    console.error("To confirm, run: node rebuild_availability_slots_from_collectors.js reset-all YES_I_AM_SURE");
                    process.exit(1);
                }

                const result = await prisma.availabilitySlot.updateMany({
                    data: { active: false }
                });

                console.log(`Disabled ${result.count} availability slots.`);
                console.log("Run 'sync-next-7' to rebuild from collector schedules.");
                break;
            }

            case "stats": {
                const today = new Date();
                today.setUTCHours(0, 0, 0, 0);

                const [total, active, inactive, futureActive, past] = await Promise.all([
                    prisma.availabilitySlot.count(),
                    prisma.availabilitySlot.count({ where: { active: true } }),
                    prisma.availabilitySlot.count({ where: { active: false } }),
                    prisma.availabilitySlot.count({
                        where: {
                            active: true,
                            date: { gte: today }
                        }
                    }),
                    prisma.availabilitySlot.count({
                        where: {
                            date: { lt: today }
                        }
                    })
                ]);

                const totalCollectors = await prisma.staffProfile.count({
                    where: {
                        role: "SAMPLE_COLLECTOR",
                        active: true
                    }
                });

                const totalSchedules = await prisma.collectorWorkingSchedule.count({
                    where: {
                        active: true,
                        workDate: { gte: today }
                    }
                });

                console.log("\n=== Availability Slot Stats ===");
                console.log(`Total slots: ${total}`);
                console.log(`Active slots: ${active}`);
                console.log(`Inactive slots: ${inactive}`);
                console.log(`Future active slots: ${futureActive}`);
                console.log(`Past slots: ${past}`);
                console.log(`\nTotal active collectors: ${totalCollectors}`);
                console.log(`Total future schedules: ${totalSchedules}`);
                break;
            }

            default:
                console.log(`
Usage: node rebuild_availability_slots_from_collectors.js <command> [args]

Commands:
  sync-date <YYYY-MM-DD>           Sync slots for a specific date
  sync-range <from> <to>           Sync slots for a date range
  sync-next-7 [days]               Sync slots for next N days (default 7)
  disable-past                     Disable all past slots
  cleanup                          Disable slots without matching collector schedules
  reset-all <YES_I_AM_SURE>        Disable ALL slots (use with caution!)
  stats                            Show statistics

Examples:
  node rebuild_availability_slots_from_collectors.js sync-next-7
  node rebuild_availability_slots_from_collectors.js sync-date 2026-05-28
  node rebuild_availability_slots_from_collectors.js sync-range 2026-05-28 2026-06-03
  node rebuild_availability_slots_from_collectors.js disable-past
  node rebuild_availability_slots_from_collectors.js cleanup
  node rebuild_availability_slots_from_collectors.js stats
                `);
        }
    } catch (error) {
        console.error("Error:", error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
