const prisma = require("../src/services/booking-runtime/prisma-client");

const API_URL = process.env.HOMELAB_CHAT_API_URL || "http://localhost:5000/api/chat";

function uniqueSession(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function postChat(message, sessionId) {
    const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId })
    });

    const payload = await response.json();

    if (!response.ok || !payload.success) {
        throw new Error(`Chat API failed: ${response.status} ${JSON.stringify(payload)}`);
    }

    return payload.data;
}

async function countConfirmedBySession(sessionId) {
    return prisma.booking.count({
        where: {
            createdFromSessionId: sessionId,
            status: "CONFIRMED"
        }
    });
}

async function getBookingByCode(bookingCode) {
    return prisma.booking.findUnique({
        where: { bookingCode }
    });
}

function hasBookingCode(text) {
    return /\bHLB-\d{8}-[A-Z0-9]{4,}\b/i.test(String(text || ""));
}

function extractBookingCode(text) {
    const match = String(text || "").match(/\bHLB-\d{8}-[A-Z0-9]{4,}\b/i);

    return match ? match[0].toUpperCase() : null;
}

function includesAny(text, words) {
    const value = String(text || "").toLowerCase();

    return words.some((word) => value.includes(word.toLowerCase()));
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
    const state = {
        bookingSession: uniqueSession("smoke_5b3_booking"),
        urgentSession: uniqueSession("smoke_5b3_urgent"),
        bookingCode: null
    };

    const cases = [
        [
            "missing_info_no_booking_created",
            async () => {
                const before = await countConfirmedBySession(state.bookingSession);
                const data = await postChat("Đặt lịch lấy mẫu máu tại nhà", state.bookingSession);
                const after = await countConfirmedBySession(state.bookingSession);

                if (hasBookingCode(data.reply)) {
                    throw new Error("reply unexpectedly contains bookingCode");
                }

                if (!includesAny(data.reply, ["loại xét nghiệm", "xét nghiệm", "gói xét nghiệm"])) {
                    throw new Error("reply does not ask for test type or required booking info");
                }

                if (after !== before) {
                    throw new Error("confirmed booking count changed");
                }
            }
        ],
        [
            "full_info_asks_confirmation_not_create_yet",
            async () => {
                const before = await countConfirmedBySession(state.bookingSession);
                const data = await postChat(
                    "Tôi muốn đặt lịch xét nghiệm công thức máu ngày mai lúc 8h tại 12 Nguyễn Trãi, tên Nguyễn Văn A, số điện thoại 0912345678",
                    state.bookingSession
                );
                const after = await countConfirmedBySession(state.bookingSession);

                if (hasBookingCode(data.reply)) {
                    throw new Error("reply unexpectedly contains bookingCode before confirmation");
                }

                if (!includesAny(data.reply, ["xác nhận", "đồng ý"])) {
                    throw new Error("reply does not ask for confirmation");
                }

                for (const expected of ["Công thức máu", "12 Nguyễn Trãi", "Nguyễn Văn A", "0912345678"]) {
                    if (!data.reply.includes(expected)) {
                        throw new Error(`confirmation summary missing ${expected}`);
                    }
                }

                if (after !== before) {
                    throw new Error("confirmed booking count changed before confirmation");
                }
            }
        ],
        [
            "confirm_creates_booking",
            async () => {
                const data = await postChat("Xác nhận", state.bookingSession);
                const bookingCode =
                    data.booking?.bookingCode || extractBookingCode(data.reply);

                if (!bookingCode) {
                    throw new Error("no HLB bookingCode returned");
                }

                const booking = await getBookingByCode(bookingCode);

                if (!booking || booking.status !== "CONFIRMED") {
                    throw new Error("DB booking is not CONFIRMED");
                }

                state.bookingCode = bookingCode;
            }
        ],
        [
            "reschedule_booking",
            async () => {
                const data = await postChat(
                    `Tôi muốn đổi lịch ${state.bookingCode} sang 9h sáng ngày mai`,
                    uniqueSession("smoke_5b3_reschedule")
                );
                const booking = await getBookingByCode(state.bookingCode);

                if (!includesAny(data.reply, ["đổi lịch", "lịch mới"])) {
                    throw new Error("reply does not confirm reschedule");
                }

                if (!booking || booking.status !== "RESCHEDULED") {
                    throw new Error("DB booking is not RESCHEDULED");
                }
            }
        ],
        [
            "cancel_booking",
            async () => {
                const data = await postChat(
                    `Tôi muốn hủy lịch ${state.bookingCode}`,
                    uniqueSession("smoke_5b3_cancel")
                );
                const booking = await getBookingByCode(state.bookingCode);

                if (!includesAny(data.reply, ["hủy thành công", "cancelled"])) {
                    throw new Error("reply does not confirm cancel");
                }

                if (!booking || booking.status !== "CANCELLED") {
                    throw new Error("DB booking is not CANCELLED");
                }
            }
        ],
        [
            "urgent_booking_does_not_create",
            async () => {
                const before = await countConfirmedBySession(state.urgentSession);
                const data = await postChat(
                    "Tôi muốn đặt lịch xét nghiệm vì đau ngực khó thở vã mồ hôi",
                    state.urgentSession
                );
                const after = await countConfirmedBySession(state.urgentSession);

                if (hasBookingCode(data.reply)) {
                    throw new Error("urgent reply unexpectedly contains bookingCode");
                }

                if (data.flow === "booking" || data.meta?.intentGroup === "booking") {
                    throw new Error("urgent case routed to booking");
                }

                if (after !== before) {
                    throw new Error("urgent session created a confirmed booking");
                }
            }
        ],
        [
            "invalid_booking_code",
            async () => {
                const data = await postChat(
                    "Tôi muốn hủy lịch HLB-20990101-XXXX",
                    uniqueSession("smoke_5b3_invalid")
                );

                if (!includesAny(data.reply, ["không tìm thấy", "kiểm tra lại", "mã"])) {
                    throw new Error("reply does not handle invalid booking code");
                }
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

    await prisma.$disconnect();

    if (failed > 0) {
        process.exit(1);
    }
}

main().catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
});
