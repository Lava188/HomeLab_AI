const prisma = require("../src/services/booking-runtime/prisma-client");

const API_BASE_URL = process.env.HOMELAB_API_BASE_URL || "http://localhost:5000";

function uniqueId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makePhone(prefix = "08") {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`
        .replace(/\D/g, "")
        .slice(-8)
        .padStart(8, "0");

    return `${prefix}${suffix}`;
}

function isoDate(offsetDays = 30) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function collectorHeaders(phone, userId = "smoke_collector_working_5h2") {
    return {
        "Content-Type": "application/json",
        "x-demo-role": "COLLECTOR",
        "x-demo-user-id": userId,
        "x-demo-phone": phone
    };
}

function adminHeaders() {
    return {
        "Content-Type": "application/json",
        "x-demo-role": "ADMIN",
        "x-demo-user-id": "smoke_collector_working_5h2_admin"
    };
}

async function request(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        signal: AbortSignal.timeout(20000)
    });
    const payload = await response.json();

    return { response, payload };
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function createCollector({ name, phone }) {
    return prisma.staffProfile.create({
        data: {
            fullName: name,
            phone,
            role: "SAMPLE_COLLECTOR",
            active: true,
            serviceArea: "Smoke collector working area schedule 5H2"
        }
    });
}

async function cleanup(state) {
    await prisma.collectorWorkingSchedule.deleteMany({
        where: { id: { in: state.scheduleIds } }
    });
    await prisma.collectorWorkingArea.deleteMany({
        where: { id: { in: state.areaIds } }
    });
    await prisma.staffProfile.deleteMany({
        where: { id: { in: state.collectorIds } }
    });
}

async function runCase(id, fn, state) {
    try {
        await fn(state);
        console.log(`PASS ${id}`);
        return { id, passed: true };
    } catch (error) {
        console.error(`FAIL ${id}: ${error.message}`);
        return { id, passed: false, error };
    }
}

async function main() {
    const suffix = uniqueId("5h2");
    const state = {
        suffix,
        collectorPhone: makePhone("08"),
        collectorBPhone: makePhone("07"),
        collector: null,
        collectorB: null,
        area: null,
        schedule: null,
        collectorIds: [],
        areaIds: [],
        scheduleIds: []
    };

    const cases = [
        [
            "create_active_collector_for_test",
            async () => {
                state.collector = await createCollector({
                    name: `Smoke Collector Working A ${suffix}`,
                    phone: state.collectorPhone
                });
                state.collectorB = await createCollector({
                    name: `Smoke Collector Working B ${suffix}`,
                    phone: state.collectorBPhone
                });
                state.collectorIds.push(state.collector.id, state.collectorB.id);

                assert(state.collector.role === "SAMPLE_COLLECTOR", "collector role mismatch");
                assert(state.collector.active === true, "collector is not active");
            }
        ],
        [
            "collector_create_working_area",
            async () => {
                const { response, payload } = await request("/api/collector/working-areas", {
                    method: "POST",
                    headers: collectorHeaders(state.collectorPhone),
                    body: JSON.stringify({
                        province: "Hà Nội",
                        district: "Cầu Giấy",
                        ward: "Dịch Vọng"
                    })
                });

                assert(response.status === 201 && payload.success, "create working area failed");
                assert(payload.data?.province === "Hà Nội", "province mismatch");
                assert(payload.data?.active === true, "area is not active");

                state.area = payload.data;
                state.areaIds.push(payload.data.id);
            }
        ],
        [
            "collector_list_own_working_areas",
            async () => {
                const { response, payload } = await request("/api/collector/working-areas", {
                    headers: collectorHeaders(state.collectorPhone)
                });

                assert(response.status === 200 && payload.success, "list working areas failed");
                assert(Array.isArray(payload.data?.workingAreas), "workingAreas missing");
                assert(
                    payload.data.workingAreas.some((area) => area.id === state.area.id),
                    "created area not found"
                );
            }
        ],
        [
            "collector_update_working_area",
            async () => {
                const { response, payload } = await request(`/api/collector/working-areas/${state.area.id}`, {
                    method: "PATCH",
                    headers: collectorHeaders(state.collectorPhone),
                    body: JSON.stringify({ ward: "Mai Dịch" })
                });

                assert(response.status === 200 && payload.success, "update working area failed");
                assert(payload.data?.ward === "Mai Dịch", "area ward was not updated");
                state.area = payload.data;
            }
        ],
        [
            "collector_cannot_update_other_collector_area",
            async () => {
                const { response, payload } = await request(`/api/collector/working-areas/${state.area.id}`, {
                    method: "PATCH",
                    headers: collectorHeaders(state.collectorBPhone, "smoke_collector_working_5h2_b"),
                    body: JSON.stringify({ ward: "Dịch Vọng" })
                });

                assert(response.status === 403, `expected 403, got ${response.status}`);
                assert(payload.success === false, "access denied response was not controlled");
                assert(payload.code === "COLLECTOR_WORKING_AREA_ACCESS_DENIED", "access denied code mismatch");
            }
        ],
        [
            "collector_create_working_schedule",
            async () => {
                const { response, payload } = await request("/api/collector/working-schedules", {
                    method: "POST",
                    headers: collectorHeaders(state.collectorPhone),
                    body: JSON.stringify({
                        workDate: isoDate(35),
                        startTime: "08:00",
                        endTime: "12:00",
                        capacity: 4
                    })
                });

                assert(response.status === 201 && payload.success, "create working schedule failed");
                assert(payload.data?.startTime === "08:00", "schedule startTime mismatch");
                assert(payload.data?.endTime === "12:00", "schedule endTime mismatch");
                assert(payload.data?.capacity === 4, "schedule capacity mismatch");

                state.schedule = payload.data;
                state.scheduleIds.push(payload.data.id);
            }
        ],
        [
            "collector_list_own_working_schedules",
            async () => {
                const { response, payload } = await request("/api/collector/working-schedules", {
                    headers: collectorHeaders(state.collectorPhone)
                });

                assert(response.status === 200 && payload.success, "list working schedules failed");
                assert(Array.isArray(payload.data?.workingSchedules), "workingSchedules missing");
                assert(
                    payload.data.workingSchedules.some((schedule) => schedule.id === state.schedule.id),
                    "created schedule not found"
                );
            }
        ],
        [
            "invalid_schedule_time_rejected",
            async () => {
                const { response, payload } = await request("/api/collector/working-schedules", {
                    method: "POST",
                    headers: collectorHeaders(state.collectorPhone),
                    body: JSON.stringify({
                        workDate: isoDate(36),
                        startTime: "12:00",
                        endTime: "08:00",
                        capacity: 4
                    })
                });

                assert(response.status === 400, `expected 400, got ${response.status}`);
                assert(payload.success === false, "invalid time response was not controlled");
                assert(payload.code === "COLLECTOR_WORK_TIME_RANGE_INVALID", "invalid time code mismatch");
            }
        ],
        [
            "collector_cannot_update_other_collector_schedule",
            async () => {
                const { response, payload } = await request(`/api/collector/working-schedules/${state.schedule.id}`, {
                    method: "PATCH",
                    headers: collectorHeaders(state.collectorBPhone, "smoke_collector_working_5h2_b"),
                    body: JSON.stringify({ active: false })
                });

                assert(response.status === 403, `expected 403, got ${response.status}`);
                assert(payload.success === false, "schedule access denied response was not controlled");
                assert(payload.code === "COLLECTOR_WORKING_SCHEDULE_ACCESS_DENIED", "schedule access denied code mismatch");
            }
        ],
        [
            "admin_staff_detail_includes_working_data_if_supported",
            async () => {
                const { response, payload } = await request(`/api/admin/staff/${state.collector.id}`, {
                    headers: adminHeaders()
                });

                assert(response.status === 200 && payload.success, "admin staff detail failed");
                assert(Array.isArray(payload.data?.workingAreas), "admin detail missing workingAreas");
                assert(Array.isArray(payload.data?.workingSchedules), "admin detail missing workingSchedules");
                assert(
                    payload.data.workingAreas.some((area) => area.id === state.area.id),
                    "admin detail missing created area"
                );
                assert(
                    payload.data.workingSchedules.some((schedule) => schedule.id === state.schedule.id),
                    "admin detail missing created schedule"
                );
            }
        ]
    ];

    const results = [];

    try {
        for (const [id, fn] of cases) {
            results.push(await runCase(id, fn, state));
        }
    } finally {
        await cleanup(state);
    }

    const passed = results.filter((result) => result.passed).length;
    const failed = results.length - passed;

    console.log(`TOTAL ${results.length} PASSED ${passed} FAILED ${failed}`);

    if (failed > 0) {
        process.exitCode = 1;
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
