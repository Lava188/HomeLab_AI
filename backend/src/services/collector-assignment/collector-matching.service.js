const prisma = require("../booking-runtime/prisma-client");
const BookingRuntimeError = require("../booking-runtime/booking-runtime-error");

const SUPPORTED_PROVINCES = new Set([
    "Hà Nội",
    "TP.HCM",
    "TP. HCM",
    "Thành phố Hồ Chí Minh",
    "Ho Chí Minh"
]);

const COMMON_DISTRICTS = new Set([
    "Cầu Giấy",
    "Đống Đa",
    "Hà Đông",
    "Thanh Xuân",
    "Tây Hồ",
    "Ba Đình",
    "Hoàn Kiếm",
    "Long Biên",
    "Nam Từ Liêm",
    "Bắc Từ Liêm",
    "Quận 1",
    "Quận 2",
    "Quận 3",
    "Quận 4",
    "Quận 5",
    "Quận 6",
    "Quận 7",
    "Quận 8",
    "Quận 9",
    "Quận 10",
    "Quận 11",
    "Quận 12",
    "Bình Thạnh",
    "Gò Vấp",
    "Phú Nhuận",
    "Tân Bình",
    "Tân Phú",
    "Bình Tân",
    "Thủ Đức"
]);

const TERMINAL_BOOKING_STATUSES = new Set([
    "CANCELLED",
    "COMPLETED",
    "NO_SHOW"
]);

const ACTIVE_ASSIGNMENT_STATUSES = new Set([
    "PENDING_COLLECTOR_CONFIRMATION",
    "ACCEPTED"
]);

function normalizeProvince(province) {
    if (!province) return null;
    const p = String(province).trim();

    if (p === "TP. HCM" || p === "TP.HCM" || p === "Ho Chí Minh") {
        return "Thành phố Hồ Chí Minh";
    }
    return p;
}

function parseVietnameseAddress(address) {
    if (!address) return null;

    const text = String(address).trim();

    let province = null;
    let district = null;
    let ward = null;

    const normalizedText = text.replace(/\./g, "").toLowerCase();

    for (const supportedProv of SUPPORTED_PROVINCES) {
        const normalizedProv = supportedProv.replace(/\./g, "").toLowerCase();
        if (normalizedText.includes(normalizedProv) ||
            normalizedText.includes(normalizedProv.replace("thành phố ", "").replace("tp.", ""))) {
            province = normalizeProvince(supportedProv);
            break;
        }
    }

    if (province) {
        for (const dist of COMMON_DISTRICTS) {
            const normalizedDist = dist.toLowerCase();
            if (normalizedText.includes(normalizedDist)) {
                district = dist;
                break;
            }
        }
    }

    if (province && district) {
        const words = text.split(/[\s,]+/).filter(w => w.length > 0);
        const districtName = district.toLowerCase();
        const districtWords = districtName.split(/\s+/);

        for (let i = 0; i < words.length; i++) {
            const word = words[i].replace(/[,\s]+/g, "").toLowerCase();
            const normalizedWord = word;

            if (districtWords.some(dw => normalizedWord === dw || normalizedWord.includes(dw))) {
                const distStartIdx = i;
                const distEndIdx = i + districtWords.length - 1;

                if (distStartIdx > 0) {
                    const prevIdx = distStartIdx - 1;
                    const prevWord = words[prevIdx].replace(/[,\s]+/g, "").toLowerCase();
                    const prevWordOriginal = words[prevIdx].replace(/[,\s]+/g, "");
                    if (prevWord.length > 1 &&
                        !prevWord.includes("quận") &&
                        !prevWord.includes("huyện") &&
                        !prevWord.includes("đường") &&
                        !prevWord.includes("phố") &&
                        !SUPPORTED_PROVINCES.has(prevWordOriginal) &&
                        !SUPPORTED_PROVINCES.has(normalizeProvince(prevWordOriginal))) {
                        ward = prevWordOriginal;
                        break;
                    }
                }
            }
        }

        if (!ward && districtWords.length === 2) {
            const firstDistWord = districtWords[0];
            for (let i = 0; i < words.length - 1; i++) {
                const word1 = words[i].replace(/[,\s]+/g, "").toLowerCase();
                const word2 = words[i + 1].replace(/[,\s]+/g, "").toLowerCase();

                if ((word1 === firstDistWord || word1.includes(firstDistWord)) &&
                    i > 0) {
                    const prevWord = words[i - 1].replace(/[,\s]+/g, "").toLowerCase();
                    if (prevWord.length > 1 &&
                        !prevWord.includes("quận") &&
                        !prevWord.includes("huyện") &&
                        !prevWord.includes("đường") &&
                        !prevWord.includes("phố") &&
                        !normalizeProvince(prevWord)) {
                        ward = words[i - 1].replace(/[,\s]+/g, "");
                        break;
                    }
                }
            }
        }

        if (!ward) {
            for (let i = 0; i < words.length; i++) {
                const word = words[i].replace(/[,\s]+/g, "").toLowerCase();
                const normalizedWord = word;
                const originalWord = words[i].replace(/[,\s]+/g, "");
                if (normalizedWord.length > 2 &&
                    !normalizedWord.includes("quận") &&
                    !normalizedWord.includes("huyện") &&
                    !normalizedWord.includes("phường") &&
                    !normalizedWord.includes("xã") &&
                    !normalizedWord.includes("đường") &&
                    !normalizedWord.includes("phố") &&
                    originalWord !== district &&
                    !normalizeProvince(originalWord)) {
                    ward = originalWord;
                    break;
                }
            }
        }
    }

    const result = { province, district, ward };
    result.hasAny = !!(province || district || ward);
    result.confidence = province ? (district ? (ward ? "high" : "medium") : "low") : "none";

    return result;
}

function matchArea(bookingAddress, collectorArea) {
    if (!bookingAddress || !collectorArea) {
        return { matched: false, level: null };
    }

    const parsed = parseVietnameseAddress(bookingAddress);
    if (!parsed || !parsed.province) {
        return { matched: false, level: null, reason: "Cannot parse booking address" };
    }

    const bookingProv = normalizeProvince(parsed.province);
    const collectorProv = normalizeProvince(collectorArea.province);

    if (bookingProv !== collectorProv) {
        return { matched: false, level: null, reason: "Province mismatch" };
    }

    if (parsed.ward && collectorArea.ward) {
        const bookingWard = parsed.ward.toLowerCase().trim();
        const collectorWard = collectorArea.ward.toLowerCase().trim();

        if (bookingWard === collectorWard ||
            bookingWard.includes(collectorWard) ||
            collectorWard.includes(bookingWard)) {
            return { matched: true, level: "WARD", reason: "Ward match" };
        }
    }

    if (parsed.district && collectorArea.district) {
        const bookingDist = parsed.district.toLowerCase().trim();
        const collectorDist = collectorArea.district.toLowerCase().trim();

        if (bookingDist === collectorDist ||
            bookingDist.includes(collectorDist) ||
            collectorDist.includes(bookingDist)) {
            return { matched: true, level: "DISTRICT", reason: "District match" };
        }
    }

    if (bookingProv === collectorProv) {
        return { matched: true, level: "PROVINCE", reason: "Province match only" };
    }

    return { matched: false, level: null, reason: "No area match" };
}

function matchSchedule(bookingDate, bookingTime, collectorSchedule) {
    if (!bookingDate || !collectorSchedule) {
        return { matched: false, reason: "Missing date or schedule" };
    }

    const bookingDateOnly = new Date(bookingDate);
    bookingDateOnly.setUTCHours(0, 0, 0, 0);

    const scheduleDateOnly = new Date(collectorSchedule.workDate);
    scheduleDateOnly.setUTCHours(0, 0, 0, 0);

    if (bookingDateOnly.getTime() !== scheduleDateOnly.getTime()) {
        return { matched: false, reason: "Date mismatch" };
    }

    if (!bookingTime) {
        return { matched: false, reason: "Missing booking time" };
    }

    const bookingMinutes = timeToMinutes(bookingTime);
    const startMinutes = timeToMinutes(collectorSchedule.startTime);
    const endMinutes = timeToMinutes(collectorSchedule.endTime);

    if (bookingMinutes >= startMinutes && bookingMinutes < endMinutes) {
        return {
            matched: true,
            reason: "Time within schedule",
            workDate: formatDateOnly(collectorSchedule.workDate),
            startTime: collectorSchedule.startTime,
            endTime: collectorSchedule.endTime
        };
    }

    return { matched: false, reason: "Time outside schedule" };
}

function timeToMinutes(timeValue) {
    if (!timeValue) return 0;

    let timeStr;
    if (typeof timeValue === "string") {
        timeStr = timeValue;
    } else {
        const date = new Date(timeValue);
        timeStr = `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
    }

    const [hour, minute] = timeStr.split(":").map(Number);
    return hour * 60 + minute;
}

function formatDateOnly(date) {
    if (!date) return null;
    const d = new Date(date);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function calculateCollectorWorkload(collectorId, targetDate) {
    const targetDateOnly = new Date(targetDate);
    targetDateOnly.setUTCHours(0, 0, 0, 0);

    const nextDay = new Date(targetDateOnly);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const assignments = await prisma.collectorAssignment.findMany({
        where: {
            collectorId,
            status: { in: Array.from(ACTIVE_ASSIGNMENT_STATUSES) },
            booking: {
                sampleDate: {
                    gte: targetDateOnly,
                    lt: nextDay
                }
            }
        },
        include: {
            booking: {
                select: {
                    sampleDate: true
                }
            }
        }
    });

    const pendingConfirmationCount = assignments.filter(
        a => a.status === "PENDING_COLLECTOR_CONFIRMATION"
    ).length;

    const acceptedCount = assignments.filter(
        a => a.status === "ACCEPTED"
    ).length;

    return {
        activeAssignedCount: assignments.length,
        pendingConfirmationCount,
        acceptedCount,
        assignedTodayCount: assignments.length
    };
}

function calculateScore(areaMatch, scheduleMatch, workload) {
    let score = 0;
    const reasons = [];
    const warnings = [];

    if (areaMatch.matched) {
        if (areaMatch.level === "WARD") {
            score += 50;
            reasons.push("Ward match (+50)");
        } else if (areaMatch.level === "DISTRICT") {
            score += 35;
            reasons.push("District match (+35)");
        } else if (areaMatch.level === "PROVINCE") {
            score += 20;
            reasons.push("Province match (+20)");
        }
    }

    if (scheduleMatch.matched) {
        score += 30;
        reasons.push("Schedule match (+30)");
    }

    const activeCount = workload.activeAssignedCount || 0;
    const workloadScore = Math.max(0, 20 - activeCount * 5);
    if (workloadScore > 0) {
        score += workloadScore;
        reasons.push(`Low workload (+${workloadScore})`);
    }

    const pendingPenalty = (workload.pendingConfirmationCount || 0) * 10;
    if (pendingPenalty > 0) {
        score -= pendingPenalty;
        warnings.push(`${workload.pendingConfirmationCount} pending confirmation (-${pendingPenalty})`);
    }

    if (activeCount > 3) {
        warnings.push(`High workload: ${activeCount} active assignments`);
    }

    score = Math.max(0, Math.min(100, score));

    return { score, reasons, warnings };
}

async function findCollectorCandidatesForBooking(bookingIdOrBookingOrCode, options = {}) {
    const limit = options.limit || 20;
    const includeDebug = options.includeDebug || false;

    let booking = null;

    if (typeof bookingIdOrBookingOrCode === "string") {
        booking = await prisma.booking.findFirst({
            where: {
                OR: [
                    { id: bookingIdOrBookingOrCode },
                    { bookingCode: bookingIdOrBookingOrCode }
                ]
            }
        });
    } else if (typeof bookingIdOrBookingOrCode === "object" && bookingIdOrBookingOrCode.id) {
        booking = bookingIdOrBookingOrCode;
    } else {
        throw new BookingRuntimeError("Invalid booking identifier", {
            code: "COLLECTOR_MATCHING_INVALID_BOOKING",
            statusCode: 400
        });
    }

    if (!booking) {
        throw new BookingRuntimeError("Booking not found", {
            code: "BOOKING_NOT_FOUND",
            statusCode: 404
        });
    }

    const warnings = [];
    const debug = includeDebug ? {} : null;

    if (TERMINAL_BOOKING_STATUSES.has(booking.status)) {
        warnings.push(`Booking is ${booking.status}, no candidates available`);
        return {
            bookingId: booking.id,
            bookingCode: booking.bookingCode,
            sampleDate: booking.sampleDate ? formatDateOnly(booking.sampleDate) : null,
            sampleTimeStart: booking.sampleTimeStart || null,
            address: booking.address || null,
            candidates: [],
            warnings,
            debug: includeDebug ? { bookingStatus: booking.status, reason: "terminal_status" } : undefined
        };
    }

    if (!booking.address) {
        warnings.push("Booking missing address, cannot match collectors by area");
        return {
            bookingId: booking.id,
            bookingCode: booking.bookingCode,
            sampleDate: booking.sampleDate ? formatDateOnly(booking.sampleDate) : null,
            sampleTimeStart: booking.sampleTimeStart || null,
            address: null,
            candidates: [],
            warnings,
            debug: includeDebug ? { reason: "missing_address" } : undefined
        };
    }

    if (!booking.sampleDate) {
        warnings.push("Booking missing sample date, cannot match schedules");
        return {
            bookingId: booking.id,
            bookingCode: booking.bookingCode,
            sampleDate: null,
            sampleTimeStart: booking.sampleTimeStart || null,
            address: booking.address,
            candidates: [],
            warnings,
            debug: includeDebug ? { reason: "missing_sample_date" } : undefined
        };
    }

    const parsedAddress = parseVietnameseAddress(booking.address);
    if (includeDebug && debug) {
        debug.parsedAddress = parsedAddress;
    }

    if (!parsedAddress || !parsedAddress.province) {
        warnings.push("Cannot parse province from booking address");
    }

    const collectors = await prisma.staffProfile.findMany({
        where: {
            role: "SAMPLE_COLLECTOR",
            active: true
        },
        include: {
            workingAreas: {
                where: { active: true }
            },
            workingSchedules: {
                where: {
                    active: true,
                    workDate: booking.sampleDate
                }
            }
        }
    });

    if (includeDebug && debug) {
        debug.totalCollectors = collectors.length;
    }

    const candidates = [];

    for (const collector of collectors) {
        const collectorData = {
            collectorId: collector.id,
            collectorName: collector.fullName,
            collectorPhone: collector.phone || null
        };

        if (collector.workingAreas.length === 0) {
            if (includeDebug && debug) {
                if (!debug.excludedCollectors) debug.excludedCollectors = [];
                debug.excludedCollectors.push({
                    ...collectorData,
                    reason: "No active working areas"
                });
            }
            continue;
        }

        if (collector.workingSchedules.length === 0) {
            if (includeDebug && debug) {
                if (!debug.excludedCollectors) debug.excludedCollectors = [];
                debug.excludedCollectors.push({
                    ...collectorData,
                    reason: "No active working schedules for booking date"
                });
            }
            continue;
        }

        let bestAreaMatch = { matched: false, level: null };
        for (const area of collector.workingAreas) {
            const matchResult = matchArea(booking.address, area);
            if (matchResult.matched) {
                if (!bestAreaMatch.matched ||
                    (matchResult.level === "WARD" && bestAreaMatch.level !== "WARD") ||
                    (matchResult.level === "DISTRICT" && bestAreaMatch.level === "PROVINCE")) {
                    bestAreaMatch = matchResult;
                }
            }
        }

        if (!bestAreaMatch.matched) {
            if (includeDebug && debug) {
                if (!debug.excludedCollectors) debug.excludedCollectors = [];
                debug.excludedCollectors.push({
                    ...collectorData,
                    reason: "No working area matches booking address"
                });
            }
            continue;
        }

        let bestScheduleMatch = { matched: false };
        for (const schedule of collector.workingSchedules) {
            const matchResult = matchSchedule(booking.sampleDate, booking.sampleTimeStart, schedule);
            if (matchResult.matched) {
                bestScheduleMatch = matchResult;
                break;
            }
        }

        if (!bestScheduleMatch.matched) {
            if (includeDebug && debug) {
                if (!debug.excludedCollectors) debug.excludedCollectors = [];
                debug.excludedCollectors.push({
                    ...collectorData,
                    reason: "No working schedule matches booking time"
                });
            }
            continue;
        }

        const workload = await calculateCollectorWorkload(collector.id, booking.sampleDate);
        const { score, reasons, warnings: scoreWarnings } = calculateScore(
            bestAreaMatch,
            bestScheduleMatch,
            workload
        );

        candidates.push({
            ...collectorData,
            score,
            reasons,
            warnings: scoreWarnings,
            workload,
            areaMatch: {
                matched: bestAreaMatch.matched,
                level: bestAreaMatch.level
            },
            scheduleMatch: {
                matched: bestScheduleMatch.matched,
                workDate: bestScheduleMatch.workDate,
                startTime: bestScheduleMatch.startTime,
                endTime: bestScheduleMatch.endTime
            }
        });
    }

    candidates.sort((a, b) => b.score - a.score);

    const limitedCandidates = candidates.slice(0, limit);

    if (limitedCandidates.length === 0 && warnings.length === 0) {
        warnings.push("No matching collectors found for this booking");
    }

    return {
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        sampleDate: formatDateOnly(booking.sampleDate),
        sampleTimeStart: booking.sampleTimeStart || null,
        address: booking.address,
        candidates: limitedCandidates,
        warnings,
        debug: includeDebug ? debug : undefined
    };
}

module.exports = {
    findCollectorCandidatesForBooking,
    parseVietnameseAddress,
    matchArea,
    matchSchedule,
    calculateCollectorWorkload,
    calculateScore
};
