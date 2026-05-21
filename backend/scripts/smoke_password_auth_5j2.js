const prisma = require("../src/services/booking-runtime/prisma-client");
const { hashPassword } = require("../src/services/password-auth.service");

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

function assertNoPasswordHash(value, path = "payload") {
    if (!value || typeof value !== "object") return;

    if (Object.prototype.hasOwnProperty.call(value, "passwordHash")) {
        throw new Error(`${path} returned passwordHash`);
    }

    for (const [key, nested] of Object.entries(value)) {
        assertNoPasswordHash(nested, `${path}.${key}`);
    }
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

async function prepareState() {
    const state = {
        userPhone: makePhone("09"),
        userEmail: `smoke-${Date.now()}@example.com`,
        unknownUserPhone: makePhone("08"),
        adminPhone: makePhone("07"),
        collectorPhone: makePhone("06"),
        collectorWrongRolePhone: makePhone("05"),
        collectorInactivePhone: makePhone("04"),
        createdCollectorPhone: makePhone("03"),
        userPassword: "UserPass@5j2",
        adminPassword: "AdminPass@5j2",
        collectorPassword: "CollectorPass@5j2",
        createdCollectorPassword: "CreatedCollector@5j2",
        userSession: null,
        adminSession: null,
        collectorSession: null,
        createdCollector: null
    };

    await prisma.patient.deleteMany({
        where: {
            phone: {
                in: [state.userPhone, state.unknownUserPhone]
            }
        }
    });

    await prisma.staffProfile.deleteMany({
        where: {
            phone: {
                in: [
                    state.adminPhone,
                    state.collectorPhone,
                    state.collectorWrongRolePhone,
                    state.collectorInactivePhone,
                    state.createdCollectorPhone
                ]
            }
        }
    });

    const [
        adminPasswordHash,
        collectorPasswordHash,
        wrongRolePasswordHash,
        inactivePasswordHash
    ] = await Promise.all([
        hashPassword(state.adminPassword),
        hashPassword(state.collectorPassword),
        hashPassword(state.collectorPassword),
        hashPassword(state.collectorPassword)
    ]);

    await prisma.staffProfile.createMany({
        data: [
            {
                fullName: "Quản trị viên Smoke 5J2",
                phone: state.adminPhone,
                role: "ADMIN",
                active: true,
                passwordHash: adminPasswordHash
            },
            {
                fullName: "Nhân viên lấy mẫu Smoke 5J2",
                phone: state.collectorPhone,
                role: "SAMPLE_COLLECTOR",
                active: true,
                passwordHash: collectorPasswordHash
            },
            {
                fullName: "Nhân viên sai vai trò Smoke 5J2",
                phone: state.collectorWrongRolePhone,
                role: "STAFF",
                active: true,
                passwordHash: wrongRolePasswordHash
            },
            {
                fullName: "Nhân viên tạm khóa Smoke 5J2",
                phone: state.collectorInactivePhone,
                role: "SAMPLE_COLLECTOR",
                active: false,
                passwordHash: inactivePasswordHash
            }
        ]
    });

    return state;
}

async function main() {
    const state = await prepareState();
    const cases = [
        [
            "user_register_invalid_email_rejected",
            async () => {
                const { response, payload } = await request("/api/user/auth/register", {
                    method: "POST",
                    body: JSON.stringify({
                        name: "Invalid Email Smoke 5J2",
                        email: "not-an-email",
                        phone: makePhone("09"),
                        password: state.userPassword
                    })
                });

                assert(response.status === 400, "invalid email did not return 400");
                assert(payload.code === "USER_EMAIL_INVALID", "invalid email code mismatch");
            }
        ],
        [
            "user_register_invalid_phone_rejected",
            async () => {
                const { response, payload } = await request("/api/user/auth/register", {
                    method: "POST",
                    body: JSON.stringify({
                        name: "Invalid Phone Smoke 5J2",
                        email: `invalid-phone-${Date.now()}@example.com`,
                        phone: `84${state.userPhone.slice(1)}`,
                        password: state.userPassword
                    })
                });

                assert(response.status === 400, "invalid phone did not return 400");
                assert(payload.code === "USER_PHONE_INVALID", "invalid phone code mismatch");
            }
        ],
        [
            "user_register_success",
            async () => {
                const { response, payload } = await request("/api/user/auth/register", {
                    method: "POST",
                    body: JSON.stringify({
                        name: "Người dùng Smoke 5J2",
                        email: state.userEmail,
                        phone: state.userPhone,
                        password: state.userPassword
                    })
                });

                state.userSession = payload.data?.session;
                assert(response.status === 201 && payload.success, "user register failed");
                assert(state.userSession?.role === "USER", "user session role mismatch");
                assert(state.userSession?.patientId, "user session missing patientId");
            }
        ],
        [
            "user_duplicate_register_rejected",
            async () => {
                const { response, payload } = await request("/api/user/auth/register", {
                    method: "POST",
                    body: JSON.stringify({
                        name: "Người dùng trùng Smoke 5J2",
                        email: `duplicate-${Date.now()}@example.com`,
                        phone: state.userPhone,
                        password: state.userPassword
                    })
                });

                assert(response.status === 409, "duplicate user did not return 409");
                assert(payload.code === "USER_ACCOUNT_ALREADY_EXISTS", "duplicate user code mismatch");
            }
        ],
        [
            "user_login_unknown_phone_rejected",
            async () => {
                const { response, payload } = await request("/api/user/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ phone: state.unknownUserPhone, password: state.userPassword })
                });

                assert(response.status === 404, "unknown user did not return 404");
                assert(payload.code === "USER_ACCOUNT_NOT_FOUND", "unknown user code mismatch");
            }
        ],
        [
            "user_login_wrong_password_rejected",
            async () => {
                const { response, payload } = await request("/api/user/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ phone: state.userPhone, password: "wrong-password" })
                });

                assert(response.status === 401, "wrong user password did not return 401");
                assert(payload.code === "INVALID_CREDENTIALS", "wrong user password code mismatch");
            }
        ],
        [
            "user_login_correct_password_success",
            async () => {
                const { response, payload } = await request("/api/user/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ phone: state.userPhone, password: state.userPassword })
                });

                state.userSession = payload.data?.session;
                assert(response.status === 200 && payload.success, "correct user login failed");
                assert(state.userSession?.patientId, "correct user login missing patientId");
            }
        ],
        [
            "admin_login_unknown_rejected",
            async () => {
                const { response, payload } = await request("/api/admin/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ phone: makePhone("02"), password: state.adminPassword })
                });

                assert(response.status === 404, "unknown admin did not return 404");
                assert(payload.code === "ADMIN_ACCOUNT_NOT_FOUND", "unknown admin code mismatch");
            }
        ],
        [
            "admin_login_wrong_password_rejected",
            async () => {
                const { response, payload } = await request("/api/admin/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ phone: state.adminPhone, password: "wrong-password" })
                });

                assert(response.status === 401, "wrong admin password did not return 401");
                assert(payload.code === "INVALID_CREDENTIALS", "wrong admin password code mismatch");
            }
        ],
        [
            "admin_login_correct_password_success",
            async () => {
                const { response, payload } = await request("/api/admin/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ phone: state.adminPhone, password: state.adminPassword })
                });

                state.adminSession = payload.data?.session;
                assert(response.status === 200 && payload.success, "correct admin login failed");
                assert(state.adminSession?.role === "ADMIN", "admin session role mismatch");
                assert(state.adminSession?.staffId, "admin session missing staffId");
            }
        ],
        [
            "collector_login_wrong_role_rejected",
            async () => {
                const { response, payload } = await request("/api/collector/auth/login", {
                    method: "POST",
                    body: JSON.stringify({
                        phone: state.collectorWrongRolePhone,
                        password: state.collectorPassword
                    })
                });

                assert(response.status === 404, "wrong collector role did not return 404");
                assert(payload.code === "COLLECTOR_ACCOUNT_NOT_FOUND", "wrong collector role code mismatch");
            }
        ],
        [
            "collector_login_inactive_rejected",
            async () => {
                const { response, payload } = await request("/api/collector/auth/login", {
                    method: "POST",
                    body: JSON.stringify({
                        phone: state.collectorInactivePhone,
                        password: state.collectorPassword
                    })
                });

                assert(response.status === 403, "inactive collector did not return 403");
                assert(payload.code === "STAFF_INACTIVE", "inactive collector code mismatch");
            }
        ],
        [
            "collector_login_correct_password_success",
            async () => {
                const { response, payload } = await request("/api/collector/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ phone: state.collectorPhone, password: state.collectorPassword })
                });

                state.collectorSession = payload.data?.session;
                assert(response.status === 200 && payload.success, "correct collector login failed");
                assert(state.collectorSession?.role === "COLLECTOR", "collector session role mismatch");
                assert(state.collectorSession?.staffId, "collector session missing staffId");
            }
        ],
        [
            "password_hash_not_returned_in_responses",
            async () => {
                assertNoPasswordHash(state.userSession, "userSession");
                assertNoPasswordHash(state.adminSession, "adminSession");
                assertNoPasswordHash(state.collectorSession, "collectorSession");
            }
        ],
        [
            "admin_create_staff_with_initial_password_success",
            async () => {
                const { response, payload } = await request("/api/admin/staff", {
                    method: "POST",
                    body: JSON.stringify({
                        name: "Nhân viên tạo mới Smoke 5J2",
                        phone: state.createdCollectorPhone,
                        role: "SAMPLE_COLLECTOR",
                        active: true,
                        initialPassword: state.createdCollectorPassword
                    })
                });

                state.createdCollector = payload.data;
                assert(response.status === 201 && payload.success, "admin create staff failed");
                assert(state.createdCollector?.id, "created staff missing id");
                assertNoPasswordHash(payload, "adminCreateStaffResponse");
            }
        ],
        [
            "created_collector_can_login_with_initial_password",
            async () => {
                const { response, payload } = await request("/api/collector/auth/login", {
                    method: "POST",
                    body: JSON.stringify({
                        phone: state.createdCollectorPhone,
                        password: state.createdCollectorPassword
                    })
                });

                assert(response.status === 200 && payload.success, "created collector login failed");
                assert(payload.data?.session?.role === "COLLECTOR", "created collector role mismatch");
                assertNoPasswordHash(payload, "createdCollectorLoginResponse");
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
