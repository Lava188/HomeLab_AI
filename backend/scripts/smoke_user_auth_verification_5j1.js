const prisma = require("../src/services/booking-runtime/prisma-client");

const API_BASE_URL = process.env.HOMELAB_API_BASE_URL || "http://localhost:5000";

function makePhone(prefix = "09") {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`
        .replace(/\D/g, "")
        .slice(-8)
        .padStart(8, "0");

    return `${prefix}${suffix}`;
}

async function parseJsonResponse(response) {
    try {
        return await response.json();
    } catch {
        throw new Error(`API did not return JSON: ${response.status}`);
    }
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
    const payload = await parseJsonResponse(response);

    return { response, payload };
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function isAuthRequired(payload) {
    const data = payload.data || {};
    return data.action === "AUTH_REQUIRED" || data.meta?.authRequired === true;
}

async function runCase(id, fn, state) {
    try {
        await fn(state);
        console.log(`PASS ${id}`);
        return { id, passed: true };
    } catch (error) {
        console.error(`FAIL ${id}: ${error.message}`);
        return { id, passed: false };
    }
}

async function main() {
    const state = {
        unknownPhone: makePhone("08"),
        registeredPhone: makePhone("09"),
        registeredEmail: `smoke-5j1-${Date.now()}@example.com`,
        password: "UserPass@5j1",
        name: "Nguyễn Văn Smoke 5J1",
        session: null
    };

    await prisma.patient.deleteMany({
        where: {
            phone: {
                in: [state.unknownPhone, state.registeredPhone]
            }
        }
    });

    const cases = [
        [
            "login_unknown_phone_rejected",
            async () => {
                const { response, payload } = await request("/api/user/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ phone: state.unknownPhone, password: state.password })
                });

                assert(response.status === 404, "unknown phone did not return 404");
                assert(payload.success === false, "unknown phone response was not controlled");
                assert(payload.code === "USER_ACCOUNT_NOT_FOUND", "unknown phone code mismatch");
            }
        ],
        [
            "register_new_patient_success",
            async () => {
                const { response, payload } = await request("/api/user/auth/register", {
                    method: "POST",
                    body: JSON.stringify({
                        name: state.name,
                        email: state.registeredEmail,
                        phone: state.registeredPhone,
                        password: state.password
                    })
                });

                state.session = payload.data?.session;

                assert(response.status === 201 && payload.success, "register endpoint failed");
                assert(state.session?.patientId, "registered session missing patientId");
                assert(state.session?.phone === state.registeredPhone, "registered session phone mismatch");
            }
        ],
        [
            "login_existing_patient_success",
            async () => {
                const { response, payload } = await request("/api/user/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ phone: state.registeredPhone, password: state.password })
                });

                state.session = payload.data?.session;

                assert(response.status === 200 && payload.success, "login endpoint failed");
                assert(state.session?.role === "USER", "login role mismatch");
                assert(state.session?.patientId, "login session missing patientId");
            }
        ],
        [
            "duplicate_register_rejected",
            async () => {
                const { response, payload } = await request("/api/user/auth/register", {
                    method: "POST",
                    body: JSON.stringify({
                        name: "Nguyễn Văn Trùng",
                        email: `duplicate-5j1-${Date.now()}@example.com`,
                        phone: state.registeredPhone,
                        password: state.password
                    })
                });

                assert(response.status === 409, "duplicate register did not return 409");
                assert(payload.success === false, "duplicate register response was not controlled");
                assert(payload.code === "USER_ACCOUNT_ALREADY_EXISTS", "duplicate register code mismatch");
            }
        ],
        [
            "user_dashboard_session_payload_has_patient_id_phone",
            async () => {
                assert(state.session?.patientId, "session missing patientId");
                assert(state.session?.phone === state.registeredPhone, "session phone mismatch");
                assert(state.session?.name === state.name, "session name mismatch");
            }
        ],
        [
            "chat_booking_auth_can_use_registered_patient_session",
            async () => {
                const { response, payload } = await request("/api/chat", {
                    method: "POST",
                    headers: {
                        "x-demo-role": "USER",
                        "x-demo-user-id": state.session.patientId,
                        "x-demo-phone": state.session.phone
                    },
                    body: JSON.stringify({
                        message: "Tôi muốn đặt lịch xét nghiệm máu tại nhà",
                        sessionId: `smoke_user_auth_5j1_${Date.now()}`
                    })
                });

                assert(response.status === 200 && payload.success, "chat endpoint failed");
                assert(!isAuthRequired(payload), "chat still required login for registered session");
            }
        ]
    ];

    const results = [];

    for (const [id, fn] of cases) {
        results.push(await runCase(id, fn, state));
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
