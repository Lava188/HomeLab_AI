/**
 * SMOKE TEST: Admin Availability Slot API (5M12)
 *
 * Tests:
 * 1. GET /api/admin/availability-slots trả slot đúng sort order (open > closed > past)
 * 2. POST /api/admin/availability-slots/sync sync slot từ collector
 * 3. POST /api/admin/availability-slots/disable-past disable slot quá khứ
 * 4. GET /api/admin/availability-slots/stats trả thống kê đúng
 */

const http = require("http");

const API_BASE = "http://localhost:3000";
const ADMIN_API_PREFIX = "/api/admin/availability-slots";

function makeRequest(path, method = "GET", data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, API_BASE);
        const options = {
            hostname: url.hostname,
            port: url.port || 3000,
            path: url.pathname + url.search,
            method,
            headers: {
                "Content-Type": "application/json"
            }
        };

        if (data) {
            const jsonData = JSON.stringify(data);
            options.headers["Content-Length"] = Buffer.byteLength(jsonData);
        }

        const req = http.request(options, (res) => {
            let body = "";

            res.on("data", (chunk) => {
                body += chunk;
            });

            res.on("end", () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on("error", reject);

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

async function test1_ListSlotsSorted() {
    console.log("\n=== TEST 1: List slots with correct sort order ===");

    const response = await makeRequest(ADMIN_API_PREFIX);

    if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
    }

    const slots = response.data.data.slots;

    if (!Array.isArray(slots)) {
        throw new Error("Expected slots to be an array");
    }

    console.log(`Found ${slots.length} slots`);

    let lastStatus = "OPEN";
    const statusOrder = ["OPEN", "FULL", "CLOSED", "PAST"];

    for (const slot of slots) {
        const status = slot.status;
        const currentIndex = statusOrder.indexOf(status);
        const lastIndex = statusOrder.indexOf(lastStatus);

        if (currentIndex < lastIndex) {
            throw new Error(`Slots not sorted correctly: found ${status} after ${lastStatus}`);
        }

        lastStatus = status;

        console.log(`  - ${slot.date} ${slot.timeStart}: ${slot.status} (capacity=${slot.capacity}, booked=${slot.bookedCount})`);
    }

    console.log("✅ TEST 1 PASSED: Slots sorted correctly by status");
}

async function test2_SyncSlots() {
    console.log("\n=== TEST 2: Sync slots from collector schedules ===");

    const today = new Date();
    today.setUTCDate(today.getUTCDate() + 1);
    const futureDate = today.toISOString().slice(0, 10);

    const response = await makeRequest(`${ADMIN_API_PREFIX}/sync?date=${futureDate}`, "POST");

    if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
    }

    const result = response.data.data;

    console.log("Sync result:", JSON.stringify(result, null, 2));

    if (!result.synced && result.reason !== "past_date") {
        throw new Error(`Expected sync to succeed, got: ${result.message}`);
    }

    console.log("✅ TEST 2 PASSED: Sync endpoint works correctly");
}

async function test3_DisablePastSlots() {
    console.log("\n=== TEST 3: Disable past slots ===");

    const response = await makeRequest(`${ADMIN_API_PREFIX}/disable-past`, "POST");

    if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
    }

    const result = response.data.data;

    console.log("Disable past result:", JSON.stringify(result, null, 2));

    if (typeof result.disabled !== "number") {
        throw new Error("Expected disabled count in response");
    }

    console.log("✅ TEST 3 PASSED: Disable past endpoint works correctly");
}

async function test4_GetStats() {
    console.log("\n=== TEST 4: Get slot statistics ===");

    const response = await makeRequest(`${ADMIN_API_PREFIX}/stats`);

    if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
    }

    const stats = response.data.data;

    console.log("Stats:", JSON.stringify(stats, null, 2));

    if (!stats.slots || typeof stats.slots.total !== "number") {
        throw new Error("Expected slots stats in response");
    }

    if (!stats.collectors || typeof stats.collectors.totalActive !== "number") {
        throw new Error("Expected collectors stats in response");
    }

    console.log(`  - Total slots: ${stats.slots.total}`);
    console.log(`  - Active slots: ${stats.slots.active}`);
    console.log(`  - Future active: ${stats.slots.futureActive}`);
    console.log(`  - Active collectors: ${stats.collectors.totalActive}`);
    console.log(`  - Future schedules: ${stats.collectors.futureSchedules}`);

    console.log("✅ TEST 4 PASSED: Stats endpoint works correctly");
}

async function test5_CreateAndUpdateSlot() {
    console.log("\n=== TEST 5: Create and update slot ===");

    const today = new Date();
    today.setUTCDate(today.getUTCDate() + 5);
    const futureDate = today.toISOString().slice(0, 10);

    const createData = {
        date: futureDate,
        timeStart: "09:00",
        timeEnd: "10:00",
        capacity: 3,
        active: true
    };

    const createResponse = await makeRequest(ADMIN_API_PREFIX, "POST", createData);

    if (createResponse.status !== 201) {
        throw new Error(`Expected status 201, got ${createResponse.status}`);
    }

    const createdSlot = createResponse.data.data;
    console.log("Created slot:", JSON.stringify(createdSlot, null, 2));

    if (createdSlot.capacity !== 3) {
        throw new Error(`Expected capacity 3, got ${createdSlot.capacity}`);
    }

    const updateData = {
        capacity: 5
    };

    const updateResponse = await makeRequest(`${ADMIN_API_PREFIX}/${createdSlot.id}`, "PATCH", updateData);

    if (updateResponse.status !== 200) {
        throw new Error(`Expected status 200, got ${updateResponse.status}`);
    }

    const updatedSlot = updateResponse.data.data;

    if (updatedSlot.capacity !== 5) {
        throw new Error(`Expected capacity 5 after update, got ${updatedSlot.capacity}`);
    }

    console.log("✅ TEST 5 PASSED: Create and update slot works correctly");
}

async function cleanup() {
    console.log("\n=== CLEANUP ===");

    const response = await makeRequest(ADMIN_API_PREFIX);

    if (response.status === 200) {
        const slots = response.data.data.slots || [];

        for (const slot of slots) {
            if (slot.date > new Date().toISOString().slice(0, 10)) {
                await makeRequest(`${ADMIN_API_PREFIX}/${slot.id}`, "PATCH", { active: false });
            }
        }
    }

    console.log("Cleanup complete");
}

async function runAllTests() {
    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };

    const tests = [
        { name: "TEST 1: List slots sorted", fn: test1_ListSlotsSorted },
        { name: "TEST 2: Sync slots", fn: test2_SyncSlots },
        { name: "TEST 3: Disable past slots", fn: test3_DisablePastSlots },
        { name: "TEST 4: Get stats", fn: test4_GetStats },
        { name: "TEST 5: Create and update slot", fn: test5_CreateAndUpdateSlot }
    ];

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

    try {
        await cleanup();
    } catch (error) {
        console.error("Cleanup failed:", error.message);
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
}

runAllTests().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
});
