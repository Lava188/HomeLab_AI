const mockSessions = require("../data/mockSessions");
const bookingRuntime = require("./booking-runtime/booking.service");
const availabilitySlotService = require("./booking-runtime/availability-slot.service");
const BookingRuntimeError = require("./booking-runtime/booking-runtime-error");
const { FLOWS, ACTIONS } = require("../constants/chat.constants");
const { createChatResult } = require("../utils/chat-response.util");
const {
    formatSlotErrorMessage,
    isBookingSlotError
} = require("./booking-response.service");
const {
    normalizeText,
    detectDateFromMessage,
    detectTimeFromMessage,
    formatDisplayDate
} = require("../utils/text.util");
const { normalizePhone } = require("./booking-runtime/booking-validation.service");
const packageCatalog = require("./booking-package-catalog.service");

const NEARBY_SLOT_LOOKAHEAD_DAYS = 7;
const NEARBY_SLOT_LIMIT = 5;

const REQUIRED_FIELDS = [
    "testType",
    "appointmentDate",
    "appointmentTime",
    "address",
    "patientName",
    "phoneNumber"
];

const CONFIRMATION_ONLY_PATTERNS = [
    "xac nhan",
    "dong y",
    "ok",
    "oke",
    "dung roi",
    "dat lich",
    "tao lich",
    "ok dat lich",
    "oke dat lich",
    "xac nhan dat lich",
    "xong dat lich"
];

const BOOKING_EDIT_NEGATIVE_SIGNALS = [
    "khong phai",
    "chua dung",
    "khong dung",
    "sai roi",
    "thay doi thong tin",
    "sua thong tin",
    "sua lai",
    "doi lich",
    "doi dia chi",
    "doi gio",
    "doi ngay",
    "doi goi",
    "doi thong tin"
];

const EXPLICIT_CONFIRMATION_SIGNALS = [
    "xac nhan",
    "dong y",
    "dung roi",
    "ok dat lich",
    "oke dat lich",
    "xac nhan dat lich",
    "dong y dat lich",
    "tao lich giup toi",
    "xong dat lich"
];

const FIELD_LABELS = {
    testType: "Gói/xét nghiệm",
    appointmentDate: "Ngày lấy mẫu",
    appointmentTime: "Giờ lấy mẫu",
    address: "Địa chỉ",
    patientName: "Tên người đặt",
    phoneNumber: "Số điện thoại"
};

const FIELD_PROMPTS = {
    testType: `gói/xét nghiệm bạn muốn đặt. HomeLab hiện có: ${packageCatalog.buildPackageListText()}`,
    appointmentDate:
        "ngày lấy mẫu. Ví dụ: ngày mai, hôm nay, hoặc 27/03/2026",
    appointmentTime: "giờ lấy mẫu. Ví dụ: 7h30, 8h, 14:00",
    address: "địa chỉ lấy mẫu rõ ràng, gồm số nhà/tên đường hoặc thôn/xóm, phường/xã hoặc quận/huyện, tỉnh/thành phố. Ví dụ: 766 Đê La Thành, phường Ô Chợ Dừa, Hà Nội",
    patientName: "tên người đặt. Ví dụ: tên Nguyễn Văn A",
    phoneNumber: "số điện thoại liên hệ. Ví dụ: 0912345678"
};

const ADDRESS_KEYWORDS = {
    street: ["duong", "pho", "street", "st", "rd"],
    alley: ["ngo", "ngach", "hem", "hemm", "hep"],
    village: ["thon", "xa", "ap", "ban", "to", "khu", "lang"],
    admin: ["phuong", "xa", "quan", "huyen", "thanh pho", "tp", "tinh", "thanh pho"]
};

const MAJOR_CITIES = [
    "ha noi", "hanoi", "tp ho chi minh", "ho chi minh", "hcm",
    "da nang", "danang", "hai phong", "haiphong",
    "can tho", "cantho", "hue", "thua thien hue"
];

function getEmptyBookingDraft() {
    return {
        testType: null,
        appointmentDate: null,
        appointmentTime: null,
        address: null,
        addressPartial: null,
        patientName: null,
        phoneNumber: null,
        testCatalogItemId: null,
        selectedPackage: null,
        packageConfirmed: false
    };
}

function hasActiveBookingSession(sessionId) {
    const session = mockSessions.getSession(sessionId);

    return Boolean(
        session &&
        session.currentFlow === FLOWS.BOOKING &&
        session.bookingDraft &&
        session.status !== "booking_created"
    );
}

function shouldHandleBookingFailureFollowup(sessionId, message) {
    const session = mockSessions.getSession(sessionId);

    if (
        !session ||
        session.currentFlow !== FLOWS.BOOKING ||
        !session.lastBookingFailure
    ) {
        return false;
    }

    if (isLastBookingFailureQuestion(message)) {
        return true;
    }

    if (
        resolveSuggestedSlotSelection(
            message,
            session.lastBookingFailure.suggestedSlots || []
        )
    ) {
        return true;
    }

    const normalizedMessage = normalizeText(message);
    const slotChangeSignals = [
        "chon khung",
        "doi sang",
        "lay khung",
        "lay luc",
        "gio khac",
        "ngay khac"
    ];

    return Boolean(
        (detectDateFromMessage(message) || detectTimeFromMessage(message)) &&
            slotChangeSignals.some((signal) => normalizedMessage.includes(signal))
    );
}

async function suspendActiveBookingSession(sessionId) {
    if (!sessionId) {
        return {
            clearedMemorySession: false,
            clearedDraftCount: 0
        };
    }

    const clearedMemorySession = mockSessions.clearSession(sessionId);
    const clearedDraft = await bookingRuntime.clearDraft(sessionId);

    return {
        clearedMemorySession,
        clearedDraftCount: clearedDraft?.count || 0
    };
}

function getMissingFields(draft) {
    return REQUIRED_FIELDS.filter((field) => !draft[field]);
}

async function detectPackageSelection(message) {
    const intent = await packageCatalog.resolvePackageIntent(message);

    if (intent.type !== "selected" || !intent.package) {
        return { intent, slots: {} };
    }

    return {
        intent,
        slots: {
            testType: intent.package.name,
            testCatalogItemId: intent.package.id,
            selectedPackage: intent.package,
            packageConfirmed: false
        }
    };
}

function detectPhoneNumber(message) {
    const match = String(message || "").match(/(\+84|0)\d(?:[\s.\-]?\d){8,10}/);

    if (!match) {
        return null;
    }

    return match[0].replace(/[\s.\-]/g, "");
}

function detectPatientName(message) {
    const match = String(message || "").match(
        /(?:\btên\b|\btÃªn\b|\bten\b)\s*[:\-]?\s*([^,;.]+)/i
    );

    if (!match) {
        return null;
    }

    return String(match[1] || "")
        .replace(/^(tÃ´i\s+lÃ |tÃƒÂ´i\s+lÃƒÂ |toi\s+la|lÃ |lÃƒÂ |la)\s+/i, "")
        .trim();
}

function detectAddress(message) {
    const text = String(message || "");
    const explicitMatch = text.match(
        /(?:địa chỉ|Ä‘á»‹a chá»‰|dia chi|address)\s*[:\-]?\s*([^;.]+)/i
    );

    if (explicitMatch) {
        return String(explicitMatch[1] || "")
            .replace(/,\s*(tên|tÃªn|ten|số điện thoại|sá»‘ Ä‘iá»‡n thoáº¡i|so dien thoai|sdt|phone)\b.*$/i, "")
            .trim();
    }

    const atMatch = text.match(
        /(?:\btại\b|\btáº¡i\b|\btai\b|\bở\b|\bá»Ÿ\b|\bo\b)\s+(.+?)(?:,\s*(?:tên|tÃªn|ten|số điện thoại|sá»‘ Ä‘iá»‡n thoáº¡i|so dien thoai|sdt|phone)\b|$)/i
    );

    if (!atMatch) {
        return null;
    }

    const candidate = String(atMatch[1] || "").trim();

    if (!/\d/.test(candidate) || candidate.length < 6) {
        return null;
    }

    return candidate;
}

function isLikelyAddressInput(message) {
    const text = String(message || "").trim();
    const normalized = normalizeText(text);

    if (/^\d{1,4}[a-zA-Z]?$/.test(text)) {
        return {
            valid: false,
            reason: "house_number_only",
            needsSpecificLocation: true,
            currentText: text
        };
    }

    if (!text || text.length < 5) {
        return { valid: false, reason: "too_short" };
    }

    if (isConfirmationOnlyMessage(text)) {
        return { valid: false, reason: "confirmation_only" };
    }

    const vaguePhrases = [
        "nha toi o", "nha to o", "gan", "gáº§n", "ben", "bÃªn", "sau", "Ä‘á»‘i diá»‡n",
        "doi dien", "phia truoc", "cua hang", "cá»­a hÃ ng", "truong hoc", "trÆ°á»ng há»c",
        "benh vien", "bá»‡nh viá»‡n", "cho", "chá»£", "nha", "nhÃ ", "con duong", "con Ä‘Æ°á»ng",
        "tim", "tÃ¬m", "khong biet", "khÃ´ng biáº¿t", "khong ro", "khÃ´ng rÃµ", "chua xac dinh",
        "chÆ°a xÃ¡c Ä‘á»‹nh", "noi cu", "nÆ¡i á»Ÿ", "o nha", "á»Ÿ nhÃ ", "day", "Ä‘Ã¢y", "do", "Ä‘Ã³"
    ];

    const hasVaguePhraseOnly = vaguePhrases.some((phrase) => {
        const normalizedPhrase = normalizeText(phrase);
        return normalized === normalizedPhrase ||
               (normalized.startsWith(normalizedPhrase) && normalized.length < normalizedPhrase.length + 10);
    });

    if (hasVaguePhraseOnly) {
        return { valid: false, reason: "too_vague" };
    }

    const hasNumberToken = /\b\d{1,4}\b/.test(text);
    const hasHouseNumber = hasNumberToken && /[a-zÃ -á»¹]/i.test(text);

    const normalizedForStreet = normalized.replace(/\bthanh\s+pho\b/g, "thanhpho");
    const hasStreetKeyword = ADDRESS_KEYWORDS.street.some((kw) =>
        new RegExp(`\\b${kw}\\b`, 'i').test(normalizedForStreet)
    );
    const hasAlleyKeyword = ADDRESS_KEYWORDS.alley.some((kw) =>
        new RegExp(`\\b${kw}\\b`, 'i').test(normalized)
    );
    const hasVillageKeyword = ADDRESS_KEYWORDS.village.some((kw) =>
        new RegExp(`\\b${kw}\\b`, 'i').test(normalized)
    );
    const hasAdminKeyword = ADDRESS_KEYWORDS.admin.some((kw) => {
        const escaped = kw.replace(/\s+/g, '\\s+');
        return new RegExp(`\\b${escaped}\\b`, 'i').test(normalized);
    });

    const hasMajorCity = MAJOR_CITIES.some((city) =>
        new RegExp(`\\b${city}\\b`, 'i').test(normalized)
    );

    const hasSpecificLocation =
        hasHouseNumber ||
        hasStreetKeyword ||
        hasAlleyKeyword ||
        hasVillageKeyword;

    const hasAdminDivision = hasAdminKeyword || hasMajorCity;

    const hasStreetLikeAddress = hasHouseNumber && /[a-zÃ -á»¹]{3,}/i.test(text);

    const hasAddressLikeContent =
        (hasSpecificLocation && hasAdminDivision) ||
        (hasStreetLikeAddress && hasAdminDivision) ||
        (hasVillageKeyword && hasAdminKeyword);

    if (!hasAddressLikeContent) {
        if (hasAdminDivision && !hasSpecificLocation && !hasStreetLikeAddress) {
            return {
                valid: false,
                reason: "admin_only",
                needsSpecificLocation: true
            };
        }

        if (hasStreetLikeAddress && !hasAdminDivision) {
            return {
                valid: false,
                reason: "missing_admin_division",
                needsCompletion: true,
                currentText: text
            };
        }

        if (hasNumberToken && !/[a-zÃ -á»¹]/i.test(text)) {
            return {
                valid: false,
                reason: "house_number_only",
                needsSpecificLocation: true,
                currentText: text
            };
        }

        return { valid: false, reason: "no_address_signals" };
    }

    const isRuralAddress = hasVillageKeyword && hasAdminKeyword;

    if (!hasHouseNumber && !hasStreetKeyword && !hasAlleyKeyword && !isRuralAddress) {
        if (hasAdminDivision) {
            return {
                valid: false,
                reason: "missing_house_number",
                needsSpecificLocation: true,
                currentText: text
            };
        }
        return {
            valid: false,
            reason: "missing_admin_division",
            needsCompletion: true,
            currentText: text
        };
    }

    return {
        valid: true,
        complete: hasAdminDivision,
        hasHouseNumber,
        hasStreetKeyword,
        hasAdminKeyword,
        isRuralAddress
    };
}

function buildAddressIncompleteReply(currentAddress) {
    return (
        "Äá»‹a chá»‰ nÃ y chÆ°a Ä‘á»§ rÃµ Ä‘á»ƒ nhÃ¢n viÃªn láº¥y máº«u Ä‘áº¿n Ä‘Ãºng nÆ¡i. " +
        "Báº¡n vui lÃ²ng bá»• sung phÆ°á»ng/xÃ£ hoáº·c quáº­n/huyá»‡n vÃ  tá»‰nh/thÃ nh phá»‘. " +
        `Hiá»‡n báº¡n Ä‘Ã£ cung cáº¥p: "${currentAddress}".`
    );
}

function buildAdminOnlyAddressReply() {
    return (
        "MÃ¬nh Ä‘Ã£ ghi nháº­n khu vá»±c hÃ nh chÃ­nh, nhÆ°ng váº«n cáº§n sá»‘ nhÃ /tÃªn Ä‘Æ°á»ng hoáº·c thÃ´n/xÃ³m/áº¥p/tá»•/khu cá»¥ thá»ƒ. " +
        "Báº¡n vui lÃ²ng nháº­p Ä‘áº§y Ä‘á»§ Ä‘á»‹a chá»‰ láº¥y máº«u. VÃ­ dá»¥: 766 ÄÃª La ThÃ nh, phÆ°á»ng Giáº£ng VÃµ, HÃ  Ná»™i."
    );
}

function buildAddressValidationReply() {
    return "Äá»‹a chá»‰ láº¥y máº«u chÆ°a Ä‘á»§ rÃµ. Báº¡n vui lÃ²ng cung cáº¥p sá»‘ nhÃ /tÃªn Ä‘Æ°á»ng hoáº·c thÃ´n/xÃ³m, phÆ°á»ng/xÃ£ hoáº·c quáº­n/huyá»‡n, tá»‰nh/thÃ nh phá»‘.";
}

function buildAddressValidationReasonReply(validation, addressText) {
    const currentText = String(
        addressText ||
        validation?.currentText ||
        ""
    ).trim();
    const quotedText = currentText ? ` "${currentText}"` : "";

    if (validation?.reason === "house_number_only") {
        return (
            `Äá»‹a chá»‰${quotedText} chÆ°a Ä‘á»§ rÃµ vÃ¬ má»›i cÃ³ sá»‘ nhÃ , chÆ°a cÃ³ tÃªn Ä‘Æ°á»ng/thÃ´n/xÃ³m, ` +
            "phÆ°á»ng/xÃ£ hoáº·c quáº­n/huyá»‡n, tá»‰nh/thÃ nh phá»‘. Báº¡n vui lÃ²ng nháº­p Ä‘áº§y Ä‘á»§ hÆ¡n, " +
            "vÃ­ dá»¥: 766 ÄÃª La ThÃ nh, phÆ°á»ng Giáº£ng VÃµ, HÃ  Ná»™i."
        );
    }

    if (validation?.reason === "missing_admin_division") {
        return (
            `Äá»‹a chá»‰${quotedText} chÆ°a Ä‘á»§ rÃµ vÃ¬ cÃ²n thiáº¿u phÆ°á»ng/xÃ£ hoáº·c quáº­n/huyá»‡n vÃ  tá»‰nh/thÃ nh phá»‘. ` +
            "Báº¡n vui lÃ²ng bá»• sung khu vá»±c hÃ nh chÃ­nh, vÃ­ dá»¥: 766 ÄÃª La ThÃ nh, phÆ°á»ng Giáº£ng VÃµ, HÃ  Ná»™i."
        );
    }

    if (
        validation?.reason === "admin_only" ||
        validation?.reason === "missing_house_number"
    ) {
        return buildAdminOnlyAddressReply();
    }

    if (validation?.reason === "too_vague" || validation?.reason === "no_address_signals") {
        return (
            `MÃ´ táº£ Ä‘á»‹a chá»‰${quotedText} chÆ°a Ä‘á»§ chÃ­nh xÃ¡c Ä‘á»ƒ nhÃ¢n viÃªn Ä‘áº¿n láº¥y máº«u. ` +
            "Báº¡n vui lÃ²ng nháº­p sá»‘ nhÃ /tÃªn Ä‘Æ°á»ng hoáº·c thÃ´n/xÃ³m, kÃ¨m phÆ°á»ng/xÃ£ hoáº·c quáº­n/huyá»‡n, tá»‰nh/thÃ nh phá»‘."
        );
    }

    return buildAddressValidationReply();
}

function hasProvinceOrCitySignal(message) {
    const normalized = normalizeText(message);

    return (
        /\b(thanh pho|tp|tinh)\b/i.test(normalized) ||
        MAJOR_CITIES.some((city) => new RegExp(`\\b${city}\\b`, "i").test(normalized))
    );
}

function mergeAddressParts(partial, addition) {
    const base = String(partial || "").trim();
    const extra = String(addition || "").trim();

    if (!base) return extra;
    if (!extra) return base;

    const normalizedBase = normalizeText(base);
    const extraParts = extra
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);

    while (
        extraParts.length > 0 &&
        normalizedBase.includes(normalizeText(extraParts[0]))
    ) {
        extraParts.shift();
    }

    if (!extraParts.length) {
        return base;
    }

    return `${base}, ${extraParts.join(", ")}`;
}

function getAddressMissingFields(missingFields) {
    return Array.from(new Set([...(missingFields || []), "address"]));
}

function isConfirmationOnlyMessage(message) {
    const normalizedMessage = normalizeText(message);
    const trimmed = normalizedMessage.trim();

    if (!trimmed) {
        return false;
    }

    if (hasBookingEditOrNegativeIntent(message)) {
        return false;
    }

    const exactMatches = [
        "xac nhan",
        "dong y",
        "ok",
        "oke",
        "dung roi",
        "xong",
        "dat lich",
        "tao lich"
    ];

    if (exactMatches.includes(trimmed)) {
        return true;
    }

    const confirmationPrefixes = [
        "xac nhan ",
        "dong y ",
        "ok ",
        "oke ",
        "dung roi ",
        "xong "
    ];

    const hasConfirmationPrefix = confirmationPrefixes.some((prefix) =>
        trimmed.startsWith(prefix)
    );

    if (hasConfirmationPrefix) {
        return true;
    }

    const hasConfirmationPattern = CONFIRMATION_ONLY_PATTERNS.some((pattern) =>
        trimmed.includes(pattern)
    );

    if (!hasConfirmationPattern) {
        return false;
    }

    const bookingFieldSignals = [
        "dia chi ",
        "dia chi:",
        "ten ",
        "ten:",
        "sdt ",
        "sdt:",
        "so dien thoai",
        "ngay ",
        "ngay:",
        "gio ",
        "gio:",
        "goi ",
        "tai ",
        "tai:"
    ];

    const hasFieldSignal = bookingFieldSignals.some((signal) =>
        normalizedMessage.includes(signal)
    );

    if (hasFieldSignal) {
        return false;
    }

    const addressLikePatterns = [
        /\d{1,4}\s+[a-zÃ -á»¹]+/i,
        /\b(duong|pho|ngo|ngach|hem|phuong|xa|quan|huyen|thanh pho|tinh)\b/i
    ];

    const hasAddressLikeContent = addressLikePatterns.some((pattern) =>
        pattern.test(message)
    );

    if (hasAddressLikeContent) {
        return false;
    }

    if (trimmed.length <= 15) {
        return true;
    }

    return false;
}

function hasBookingEditOrNegativeIntent(message) {
    const normalizedMessage = normalizeText(message);

    return BOOKING_EDIT_NEGATIVE_SIGNALS.some((signal) =>
        normalizedMessage.includes(signal)
    );
}

function inferSingleFieldByContext(message, currentDraft) {
    const missingFields = getMissingFields(currentDraft);
    const firstMissingField = missingFields[0];
    const trimmedMessage = String(message || "").trim();

    if (!firstMissingField || !trimmedMessage) {
        return {};
    }

    if (isConfirmationOnlyMessage(trimmedMessage)) {
        return {};
    }

    if (firstMissingField === "address") {
        const normalized = normalizeText(trimmedMessage);

        if (
            normalized.startsWith("ten") ||
            normalized.startsWith("dia chi") ||
            normalized.startsWith("sdt") ||
            detectPhoneNumber(trimmedMessage)
        ) {
            return {};
        }

        const addressValidation = isLikelyAddressInput(trimmedMessage);

        if (addressValidation.valid) {
            return { address: trimmedMessage };
        }

        if (addressValidation.needsCompletion) {
            return { addressPartial: trimmedMessage };
        }

        return {};
    }

    if (firstMissingField === "patientName") {
        const hasDigits = /\d/.test(trimmedMessage);
        const wordCount = trimmedMessage.split(/\s+/).length;

        if (!hasDigits && wordCount >= 2 && wordCount <= 6) {
            return { patientName: trimmedMessage };
        }
    }

    return {};
}

async function extractBookingSlots(message, currentDraft) {
    const extracted = {};

    if (isConfirmationOnlyMessage(message)) {
        return {
            slots: {},
            packageIntent: { type: "none", package: null },
            addressValidation: null
        };
    }

    const { intent: packageIntent, slots: packageSlots } =
        await detectPackageSelection(message);
    const appointmentDate = detectDateFromMessage(message);
    const appointmentTime = detectTimeFromMessage(message);
    const address = detectAddress(message);
    const patientName = detectPatientName(message);
    const phoneNumber = detectPhoneNumber(message);

    Object.assign(extracted, packageSlots);

    if (appointmentDate) extracted.appointmentDate = appointmentDate;
    if (appointmentTime) extracted.appointmentTime = appointmentTime;

    let addressValidation = null;
    let addressPartialToMerge = currentDraft.addressPartial || null;

    if (address) {
        addressValidation = isLikelyAddressInput(address);

        if (addressValidation.valid) {
            if (addressPartialToMerge) {
                const mergedCandidate = mergeAddressParts(addressPartialToMerge, address);
                const mergedValidation = isLikelyAddressInput(mergedCandidate);

                if (mergedValidation.valid && hasProvinceOrCitySignal(mergedCandidate)) {
                    extracted.address = mergedCandidate;
                    extracted.addressPartial = null;
                    addressValidation = mergedValidation;
                } else {
                    extracted.addressPartial = mergedCandidate;
                    addressValidation = {
                        ...mergedValidation,
                        needsCompletion: true,
                        reason: mergedValidation.reason || "missing_admin_division"
                    };
                }
            } else {
                extracted.address = address;
            }
        } else if (addressValidation.needsCompletion) {
            extracted.addressPartial = addressPartialToMerge
                ? mergeAddressParts(addressPartialToMerge, address)
                : address;
        } else if (addressValidation.reason === "admin_only" && addressPartialToMerge) {
            const mergedCandidate = mergeAddressParts(addressPartialToMerge, address);
            const mergedValidation = isLikelyAddressInput(mergedCandidate);

            if (mergedValidation.valid && hasProvinceOrCitySignal(mergedCandidate)) {
                extracted.address = mergedCandidate;
                extracted.addressPartial = null;
                addressValidation = mergedValidation;
            } else if (mergedValidation.needsCompletion || mergedValidation.valid) {
                extracted.addressPartial = mergedCandidate;
                addressValidation = {
                    ...mergedValidation,
                    needsCompletion: true,
                    reason: mergedValidation.reason || "missing_admin_division"
                };
            }
        }
    }

    if (patientName) extracted.patientName = patientName;
    if (phoneNumber) extracted.phoneNumber = phoneNumber;

    const contextInference = inferSingleFieldByContext(message, {
        ...currentDraft,
        ...extracted
    });

    if (contextInference.addressPartial && !addressValidation) {
        addressValidation = isLikelyAddressInput(contextInference.addressPartial);
    }

    if (contextInference.address && !extracted.address) {
        addressValidation = isLikelyAddressInput(contextInference.address);
        if (addressValidation.valid) {
            if (addressPartialToMerge) {
                const mergedCandidate = mergeAddressParts(
                    addressPartialToMerge,
                    contextInference.address
                );
                const mergedValidation = isLikelyAddressInput(mergedCandidate);

                if (mergedValidation.valid && hasProvinceOrCitySignal(mergedCandidate)) {
                    extracted.address = mergedCandidate;
                    extracted.addressPartial = null;
                    addressValidation = mergedValidation;
                } else {
                    extracted.addressPartial = mergedCandidate;
                    addressValidation = {
                        ...mergedValidation,
                        needsCompletion: true,
                        reason: mergedValidation.reason || "missing_admin_division"
                    };
                }
            } else {
                extracted.address = contextInference.address;
            }
            delete contextInference.address;
        } else if (addressPartialToMerge && addressValidation.reason === "admin_only") {
            const mergedCandidate = mergeAddressParts(
                addressPartialToMerge,
                contextInference.address
            );
            const mergedValidation = isLikelyAddressInput(mergedCandidate);

            if (mergedValidation.valid && hasProvinceOrCitySignal(mergedCandidate)) {
                extracted.address = mergedCandidate;
                extracted.addressPartial = null;
                addressValidation = mergedValidation;
            } else {
                extracted.addressPartial = mergedCandidate;
                addressValidation = {
                    ...mergedValidation,
                    needsCompletion: true,
                    reason: mergedValidation.reason || "missing_admin_division"
                };
            }
            delete contextInference.address;
        } else if (addressValidation.needsCompletion) {
            extracted.addressPartial = addressPartialToMerge
                ? mergeAddressParts(addressPartialToMerge, contextInference.address)
                : contextInference.address;
            delete contextInference.address;
        } else {
            delete contextInference.address;
        }
    }

    if (!extracted.address && addressPartialToMerge) {
        const supplementValidation = isLikelyAddressInput(message);

        if (supplementValidation.reason === "admin_only") {
            const mergedCandidate = mergeAddressParts(addressPartialToMerge, message);
            const mergedValidation = isLikelyAddressInput(mergedCandidate);

            if (mergedValidation.valid && hasProvinceOrCitySignal(mergedCandidate)) {
                extracted.address = mergedCandidate;
                extracted.addressPartial = null;
                addressValidation = mergedValidation;
            } else {
                extracted.addressPartial = mergedCandidate;
                addressValidation = {
                    ...mergedValidation,
                    needsCompletion: true,
                    reason: mergedValidation.reason || "missing_admin_division"
                };
            }
        }
    }

    if (!extracted.address && !extracted.addressPartial) {
        const missingFields = getMissingFields(currentDraft);

        if (missingFields[0] === "address") {
            const messageAddressValidation = isLikelyAddressInput(message);

            if (
                messageAddressValidation.reason === "admin_only" ||
                messageAddressValidation.reason === "house_number_only" ||
                messageAddressValidation.reason === "too_vague" ||
                messageAddressValidation.reason === "no_address_signals"
            ) {
                addressValidation = messageAddressValidation;
            }
        }
    }

    return {
        slots: {
            ...extracted,
            ...contextInference
        },
        packageIntent,
        addressValidation
    };
}

function buildKnownFieldsText(draft) {
    const knownParts = [];

    if (draft.testType) knownParts.push(`${FIELD_LABELS.testType}: ${draft.testType}`);
    if (draft.appointmentDate) {
        knownParts.push(
            `${FIELD_LABELS.appointmentDate}: ${formatDisplayDate(draft.appointmentDate)}`
        );
    }
    if (draft.appointmentTime) {
        knownParts.push(`${FIELD_LABELS.appointmentTime}: ${draft.appointmentTime}`);
    }
    if (draft.address) knownParts.push(`${FIELD_LABELS.address}: ${draft.address}`);
    if (draft.patientName) {
        knownParts.push(`${FIELD_LABELS.patientName}: ${draft.patientName}`);
    }
    if (draft.phoneNumber) {
        knownParts.push(`${FIELD_LABELS.phoneNumber}: ${draft.phoneNumber}`);
    }

    return knownParts;
}

function buildCollectingReply(draft, missingFields) {
    const knownFields = buildKnownFieldsText(draft);
    const nextField = missingFields[0];

    let reply = "Mình đang hỗ trợ bạn đặt lịch xét nghiệm/lấy mẫu tại nhà.";

    if (knownFields.length > 0) {
        reply += ` Hiện mình đã ghi nhận: ${knownFields.join("; ")}.`;
    }

    reply += ` Bạn vui lòng cung cấp thêm ${FIELD_PROMPTS[nextField]}.`;

    return reply;
}

function buildReadyReply(draft) {
    const summary = [
        `${FIELD_LABELS.testType}: ${draft.testType}`,
        `${FIELD_LABELS.appointmentDate}: ${formatDisplayDate(draft.appointmentDate)}`,
        `${FIELD_LABELS.appointmentTime}: ${draft.appointmentTime}`,
        `${FIELD_LABELS.address}: ${draft.address}`,
        `${FIELD_LABELS.patientName}: ${draft.patientName}`,
        `${FIELD_LABELS.phoneNumber}: ${draft.phoneNumber}`
    ];

    return (
        "Mình đã có đủ thông tin để đặt lịch. Bạn kiểm tra lại giúp mình: " +
        summary.join("; ") +
        ". Nếu đúng, hãy trả lời 'Xác nhận' hoặc 'Đồng ý' để mình tạo lịch hẹn."
    );
}

function formatSuggestedSlot(slot) {
    return `${formatDisplayDate(slot.date)} lÃºc ${slot.timeStart}`;
}

function buildSuggestedSlotsText(suggestedSlots) {
    if (!suggestedSlots.length) {
        return "";
    }

    return [
        "Bạn có thể chọn một trong các khung giờ gần nhất còn trống:",
        ...suggestedSlots.map((slot) => `- ${formatSuggestedSlot(slot)}`)
    ].join("\n");
}

function getSlotFailureReasonCode(error, suggestedSlots) {

    if (error?.code === "BOOKING_SLOT_NOT_OPEN") {
        return suggestedSlots.length ? "SLOT_NOT_OPEN" : "NO_AVAILABLE_NEARBY_SLOT";
    }

    if (error?.code === "BOOKING_SLOT_FULL") {
        return suggestedSlots.length ? "SLOT_FULL" : "NO_AVAILABLE_NEARBY_SLOT";
    }

    if (error instanceof BookingRuntimeError) {
        return "VALIDATION_ERROR";
    }

    return "UNKNOWN_ERROR";
}

function getRequestedSlotFromError(error, draft) {
    const slot = error?.details?.slot || {};

    return {
        date: error?.details?.sampleDate || slot.date || draft.appointmentDate || null,
        time: error?.details?.sampleTimeStart || slot.timeStart || draft.appointmentTime || null
    };
}

function buildSlotFailureMessage({ error, draft, suggestedSlots }) {
    const requested = getRequestedSlotFromError(error, draft);
    const dateText = requested.date ? formatDisplayDate(requested.date) : "ngày bạn chọn";
    const timeText = requested.time || "khung giờ bạn chọn";
    const suggestionsText = buildSuggestedSlotsText(suggestedSlots);

    if (!suggestedSlots.length && error?.code === "BOOKING_SLOT_NOT_OPEN") {
        return [
            `Mình chưa thể tạo lịch vì khung giờ ${timeText} ngày ${dateText} hiện chưa mở lịch lấy mẫu.`,
            "Bạn vui lòng chọn ngày khác hoặc chờ admin mở thêm lịch.",
            "Mình vẫn giữ thông tin đặt lịch hiện tại của bạn."
        ].join("\n\n");
    }

    if (!suggestedSlots.length && error?.code === "BOOKING_SLOT_FULL") {
        return [
            `Khung giờ ${timeText} ngày ${dateText} hiện đã hết chỗ.`,
            "Bạn vui lòng chọn ngày khác hoặc chờ admin mở thêm lịch.",
            "Mình vẫn giữ thông tin đặt lịch hiện tại của bạn."
        ].join("\n\n");
    }

    if (!suggestedSlots.length && isBookingSlotError(error)) {
        return [
            `Mình chưa thể tạo lịch vì hiện HomeLab chưa có khung giờ lấy mẫu khả dụng gần ngày ${dateText}.`,
            "Bạn vui lòng chọn ngày khác hoặc chờ admin mở thêm lịch.",
            "Mình vẫn giữ thông tin đặt lịch hiện tại của bạn."
        ].join("\n\n");
    }

    if (error?.code === "BOOKING_SLOT_NOT_OPEN") {
        return [
            `Mình chưa thể tạo lịch vì khung giờ ${timeText} ngày ${dateText} hiện chưa mở lịch lấy mẫu.`,
            suggestionsText,
            "Mình vẫn giữ thông tin đặt lịch hiện tại của bạn. Bạn muốn chọn khung giờ nào?"
        ].filter(Boolean).join("\n\n");
    }

    if (error?.code === "BOOKING_SLOT_FULL") {
        return [
            `Khung giờ ${timeText} ngày ${dateText} hiện đã hết chỗ.`,
            suggestionsText,
            "Mình vẫn giữ thông tin đặt lịch hiện tại của bạn. Bạn muốn chọn khung giờ nào?"
        ].filter(Boolean).join("\n\n");
    }

    return "Mình chưa thể tạo lịch với thông tin hiện tại. Bạn vui lòng kiểm tra lại thông tin đặt lịch hoặc liên hệ HomeLab để được hỗ trợ.";
}

function buildFailureDraftSummary(draft) {
    return buildKnownFieldsText(draft).join("; ");
}

function mapRuntimeValidationField(field) {
    const fieldMap = {
        testType: "testType",
        testCatalogItemId: "testType",
        testTypeText: "testType",
        sampleDate: "appointmentDate",
        sampleTimeStart: "appointmentTime",
        address: "address",
        patientName: "patientName",
        phone: "phoneNumber"
    };

    return fieldMap[field] || null;
}

function buildRuntimeValidationFailureMessage(error) {
    const field = error?.details?.field;

    if (field === "address") {
        return buildAddressValidationReply();
    }

    if (field === "phone") {
        return "Sá»‘ Ä‘iá»‡n thoáº¡i liÃªn há»‡ chÆ°a há»£p lá»‡. Báº¡n vui lÃ²ng cung cáº¥p sá»‘ Ä‘iá»‡n thoáº¡i Viá»‡t Nam há»£p lá»‡, vÃ­ dá»¥: 0912345678.";
    }

    if (field === "sampleDate") {
        return "NgÃ y láº¥y máº«u chÆ°a há»£p lá»‡ hoáº·c Ä‘Ã£ á»Ÿ quÃ¡ khá»©. Báº¡n vui lÃ²ng chá»n ngÃ y láº¥y máº«u khÃ¡c.";
    }

    if (field === "sampleTimeStart") {
        return "Giá» láº¥y máº«u chÆ°a há»£p lá»‡. Báº¡n vui lÃ²ng nháº­p láº¡i giá» láº¥y máº«u, vÃ­ dá»¥: 7h30, 8h hoáº·c 14:00.";
    }

    if (field === "patientName") {
        return "TÃªn ngÆ°á»i Ä‘áº·t chÆ°a há»£p lá»‡. Báº¡n vui lÃ²ng cung cáº¥p há» tÃªn ngÆ°á»i Ä‘áº·t lá»‹ch.";
    }

    if (field === "testType") {
        return `GÃ³i/xÃ©t nghiá»‡m chÆ°a há»£p lá»‡. Báº¡n vui lÃ²ng chá»n má»™t gÃ³i HomeLab Ä‘ang há»— trá»£: ${packageCatalog.buildPackageListText()}.`;
    }

    return error?.message
        ? `MÃ¬nh chÆ°a thá»ƒ táº¡o lá»‹ch vÃ¬ ${error.message}.`
        : "MÃ¬nh chÆ°a thá»ƒ táº¡o lá»‹ch vÃ¬ thÃ´ng tin Ä‘áº·t lá»‹ch chÆ°a há»£p lá»‡.";
}

function isLastBookingFailureQuestion(message) {
    const normalizedMessage = normalizeText(message);
    const signals = [
        "tai sao chua the tao lich",
        "tai sao chua tao lich",
        "vi sao khong dat duoc",
        "sao chua tao lich",
        "loi gi",
        "loi la gi",
        "vi sao"
    ];

    return signals.some((signal) => normalizedMessage.includes(signal));
}

function buildLastBookingFailureReply(lastBookingFailure) {
    const suggestedSlots = lastBookingFailure?.suggestedSlots || [];
    const suggestionsText = buildSuggestedSlotsText(suggestedSlots);

    return [
        lastBookingFailure?.message || "Lá»‹ch chÆ°a Ä‘Æ°á»£c táº¡o vÃ¬ thÃ´ng tin Ä‘áº·t lá»‹ch hiá»‡n táº¡i chÆ°a thá»ƒ xÃ¡c nháº­n.",
        "MÃ¬nh váº«n giá»¯ báº£n nhÃ¡p Ä‘áº·t lá»‹ch cá»§a báº¡n.",
        suggestionsText || null
    ].filter(Boolean).join("\n\n");
}

function resolveSuggestedSlotSelection(message, suggestedSlots = []) {
    if (!suggestedSlots.length) {
        return null;
    }

    const normalizedMessage = normalizeText(message);
    const ordinalMap = [
        ["dau tien", 0],
        ["so 1", 0],
        ["thu nhat", 0],
        ["thu 1", 0],
        ["thu hai", 1],
        ["so 2", 1],
        ["thu 2", 1],
        ["thu ba", 2],
        ["so 3", 2],
        ["thu 3", 2]
    ];

    for (const [signal, index] of ordinalMap) {
        if (normalizedMessage.includes(signal) && suggestedSlots[index]) {
            return suggestedSlots[index];
        }
    }

    const selectedDate = detectDateFromMessage(message);
    const selectedTime = detectTimeFromMessage(message);

    if (!selectedDate && !selectedTime) {
        return null;
    }

    return suggestedSlots.find((slot) => {
        const dateMatches = selectedDate ? slot.date === selectedDate : true;
        const timeMatches = selectedTime ? slot.timeStart === selectedTime : true;

        return dateMatches && timeMatches;
    }) || null;
}

async function buildBookingFailureResult({
    error,
    sessionId,
    message,
    draft,
    extractedSlots,
    packageIntent
}) {
    if (
        error?.code === "BOOKING_VALIDATION_ERROR" &&
        error?.details?.field === "address"
    ) {
        const addressDraft = {
            ...draft,
            address: null,
            addressPartial: draft.address || draft.addressPartial || null
        };
        const userMessage = buildAddressValidationReply();
        const lastBookingFailure = {
            reasonCode: "VALIDATION_ERROR",
            errorCode: error.code,
            field: "address",
            message: userMessage,
            draftSummary: buildFailureDraftSummary(addressDraft),
            suggestedSlots: [],
            requestedSlot: getRequestedSlotFromError(error, draft)
        };

        await persistDraft(sessionId, addressDraft, ["address"]);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: "collecting_info",
            bookingDraft: addressDraft,
            confirmedBookingId: null,
            lastBookingFailure
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: userMessage,
            booking: {
                status: "draft",
                draft: addressDraft,
                missingFields: ["address"]
            },
            meta: {
                ...buildBookingMeta({
                    updatedSession,
                    extractedSlots,
                    packageIntent,
                    missingFields: ["address"],
                    nextExpectedField: "address"
                }),
                lastBookingFailure,
                errorCode: error.code
            }
        });
    }

    if (error?.code === "BOOKING_VALIDATION_ERROR") {
        const runtimeField = mapRuntimeValidationField(error?.details?.field);
        const missingFields = runtimeField ? [runtimeField] : getMissingFields(draft);
        const userMessage = buildRuntimeValidationFailureMessage(error);
        const lastBookingFailure = {
            reasonCode: "VALIDATION_ERROR",
            errorCode: error.code,
            field: error?.details?.field || null,
            message: userMessage,
            draftSummary: buildFailureDraftSummary(draft),
            suggestedSlots: [],
            requestedSlot: getRequestedSlotFromError(error, draft)
        };

        await persistDraft(sessionId, draft, missingFields);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: "collecting_info",
            bookingDraft: draft,
            confirmedBookingId: null,
            lastBookingFailure
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: userMessage,
            booking: {
                status: "draft",
                draft,
                missingFields
            },
            meta: {
                ...buildBookingMeta({
                    updatedSession,
                    extractedSlots,
                    packageIntent,
                    missingFields,
                    nextExpectedField: missingFields[0] || null
                }),
                lastBookingFailure,
                errorCode: error.code
            }
        });
    }

    const requested = getRequestedSlotFromError(error, draft);
    const suggestedSlots = isBookingSlotError(error) && requested.date
        ? await availabilitySlotService.findAvailableNearbySlots({
            requestedDate: requested.date,
            area: null,
            days: NEARBY_SLOT_LOOKAHEAD_DAYS,
            limit: NEARBY_SLOT_LIMIT
        })
        : [];
    const reasonCode = getSlotFailureReasonCode(error, suggestedSlots);
    const userMessage = buildSlotFailureMessage({
        error,
        draft,
        suggestedSlots
    });
    const lastBookingFailure = {
        reasonCode,
        message: userMessage,
        draftSummary: buildFailureDraftSummary(draft),
        suggestedSlots,
        requestedSlot: requested
    };

    await persistDraft(sessionId, draft, []);
    const updatedSession = mockSessions.upsertSession(sessionId, {
        currentFlow: FLOWS.BOOKING,
        status: "slot_blocked",
        bookingDraft: draft,
        confirmedBookingId: null,
        lastBookingFailure
    });

    return createChatResult({
        sessionId,
        userMessage: message,
        flow: FLOWS.BOOKING,
        action: ACTIONS.BOOKING_READY_TO_CONFIRM,
        reply: userMessage,
        booking: {
            status: "pending_confirmation",
            draft,
            missingFields: []
        },
        meta: {
            ...buildBookingMeta({
                updatedSession,
                extractedSlots,
                packageIntent,
                missingFields: [],
                nextExpectedField: "appointmentTime"
            }),
            lastBookingFailure,
            slotFailureReason: reasonCode
        }
    });
}

function buildPackageBookingConfirmationReply(draft, includePackageDetail = true) {
    const knownFields = buildKnownFieldsText(draft);

    if (includePackageDetail) {
        const packageReply = packageCatalog.buildPackageConfirmationReply(
            draft.selectedPackage
        );

        if (!knownFields.length) {
            return packageReply;
        }

        return [
            packageReply,
            `Mình đã ghi nhận thêm: ${knownFields.join("; ")}.`
        ].join("\n\n");
    }

    let reply = "Mình đang hỗ trợ bạn đặt lịch xét nghiệm/lấy mẫu tại nhà.";

    if (knownFields.length > 0) {
        reply += ` Hiện mình đã ghi nhận: ${knownFields.join("; ")}.`;
    }

    return reply;
}

function buildConfirmationOnlyBlockedReply(draft, missingFields) {
    const knownFields = buildKnownFieldsText(draft);
    const nextField = missingFields[0];

    return (
        "Mình chưa thể tạo lịch vì còn thiếu " +
        `${FIELD_LABELS[nextField]}. ` +
        (knownFields.length > 0
            ? `Hiện mình đã ghi nhận: ${knownFields.join("; ")}. `
            : "") +
        `Bạn vui lòng cung cấp thêm ${FIELD_PROMPTS[nextField]}.`
    );
}

function buildNoActiveDraftConfirmationReply() {
    return (
        "Minh chua co thong tin lich hen nao dang cho xac nhan trong phien chat nay. " +
        "Ban vui long cung cap thong tin dat lich gom goi xet nghiem, ngay gio lay mau, dia chi va thong tin lien he."
    );
}

function buildBookingEditIntentReply() {
    return "Ban muon doi goi xet nghiem, ngay gio lay mau, dia chi hay thong tin nguoi dat?";
}

function buildDifferentPhoneReply(sessionPhone) {
    return `Lịch hẹn sẽ được tạo theo số điện thoại tài khoản đang đăng nhập: ${sessionPhone}. Nếu bạn muốn đặt cho số khác, vui lòng đăng xuất và đăng nhập bằng tài khoản phù hợp.`;
}

function buildCreatedReply(booking) {
    return (
        `Đã tạo lịch hẹn thành công. Mã đặt lịch của bạn là ${booking.bookingCode}. ` +
        `Thông tin đã ghi nhận gồm: ` +
        `${FIELD_LABELS.testType}: ${booking.testName || booking.testTypeText}; ` +
        `${FIELD_LABELS.appointmentDate}: ${formatDisplayDate(booking.sampleDate)}; ` +
        `${FIELD_LABELS.appointmentTime}: ${booking.sampleTimeStart}; ` +
        `${FIELD_LABELS.address}: ${booking.address}; ` +
        `${FIELD_LABELS.patientName}: ${booking.patientName}; ` +
        `${FIELD_LABELS.phoneNumber}: ${booking.phone}.`
    );
}

function isConfirmationMessage(message) {
    const normalizedMessage = normalizeText(message);
    const trimmed = normalizedMessage.trim();

    if (!trimmed || hasBookingEditOrNegativeIntent(message)) {
        return false;
    }

    if (EXPLICIT_CONFIRMATION_SIGNALS.includes(trimmed)) {
        return true;
    }

    return EXPLICIT_CONFIRMATION_SIGNALS.some((keyword) =>
        normalizedMessage.startsWith(`${keyword} `)
    );
}

function isActivePendingBookingSession(session) {
    return Boolean(
        session &&
        session.currentFlow === FLOWS.BOOKING &&
        session.bookingDraft &&
        !session.confirmedBookingId &&
        !["booking_created", "booking_closed"].includes(session.status)
    );
}

function buildRuntimePayloadFromDraft(draft) {
    return {
        testCatalogItemId: draft.testCatalogItemId || draft.selectedPackage?.id || null,
        testTypeText: draft.selectedPackage?.name || draft.testType,
        sampleDate: draft.appointmentDate,
        sampleTimeStart: draft.appointmentTime,
        address: draft.address,
        patientName: draft.patientName,
        phone: draft.phoneNumber
    };
}

async function persistDraft(sessionId, draft, missingFields) {
    if (!sessionId) return;

    await bookingRuntime.saveOrUpdateDraft(sessionId, draft, missingFields);
}

function buildBookingMeta({
    updatedSession,
    extractedSlots,
    packageIntent,
    missingFields,
    nextExpectedField
}) {
    return {
        handledBy: "booking.service",
        sessionState: updatedSession.status,
        extractedSlots,
        missingFields,
        nextExpectedField: nextExpectedField || null,
        confirmedBookingId: updatedSession.confirmedBookingId || null,
        packageIntent: packageIntent?.type || null,
        packageCandidates:
            packageIntent?.type === "ambiguous" ? packageIntent.candidates : undefined,
        selectedPackage:
            packageIntent?.package || updatedSession.bookingDraft?.selectedPackage || null,
        packageConfirmed:
            Boolean(updatedSession.bookingDraft?.packageConfirmed)
    };
}

async function returnDraftResult({
    sessionId,
    message,
    status,
    action,
    reply,
    booking,
    draft,
    missingFields,
    extractedSlots,
    packageIntent,
    nextExpectedField
}) {
    await persistDraft(sessionId, draft, missingFields);

    const updatedSession = mockSessions.upsertSession(sessionId, {
        currentFlow: FLOWS.BOOKING,
        status,
        bookingDraft: draft,
        confirmedBookingId: null,
        lastBookingFailure: null
    });

    return createChatResult({
        sessionId,
        userMessage: message,
        flow: FLOWS.BOOKING,
        action,
        reply,
        booking,
        meta: buildBookingMeta({
            updatedSession,
            extractedSlots,
            packageIntent,
            missingFields,
            nextExpectedField
        })
    });
}

async function handleBookingMessage({ message, sessionId, userSession = {} }) {
    const sessionPhone = normalizePhone(userSession.phone || "");
    let session = mockSessions.getSession(sessionId);
    const editOrNegativeIntent = hasBookingEditOrNegativeIntent(message);
    const explicitConfirmationIntent = isConfirmationMessage(message);

    if (session?.currentFlow === FLOWS.BOOKING && session.status === "booking_created") {
        await bookingRuntime.clearDraft(sessionId);
        session = mockSessions.upsertSession(sessionId, {
            currentFlow: null,
            status: "booking_closed",
            bookingDraft: null,
            confirmedBookingId: null,
            lastBookingFailure: null
        });
    }

    if (editOrNegativeIntent && !isActivePendingBookingSession(session)) {
        await bookingRuntime.clearDraft(sessionId);
        mockSessions.upsertSession(sessionId, {
            currentFlow: null,
            status: "booking_edit_needs_target",
            bookingDraft: null,
            confirmedBookingId: null,
            lastBookingFailure: null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildBookingEditIntentReply(),
            booking: null,
            meta: {
                handledBy: "booking.service",
                sessionState: "booking_edit_needs_target",
                editOrNegativeIntent: true,
                missingFields: [],
                nextExpectedField: "editTarget"
            }
        });
    }

    if (explicitConfirmationIntent && !isActivePendingBookingSession(session)) {
        await bookingRuntime.clearDraft(sessionId);

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildNoActiveDraftConfirmationReply(),
            booking: null,
            meta: {
                handledBy: "booking.service",
                sessionState: "no_active_booking_draft",
                missingFields: REQUIRED_FIELDS,
                nextExpectedField: "testType"
            }
        });
    }

    if (!session || session.currentFlow !== FLOWS.BOOKING || !session.bookingDraft) {
        session = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: "collecting_info",
            bookingDraft: getEmptyBookingDraft(),
            confirmedBookingId: null
        });
    }

    const currentDraft = {
        ...getEmptyBookingDraft(),
        ...(session.bookingDraft || {})
    };

    if (editOrNegativeIntent) {
        return returnDraftResult({
            sessionId,
            message,
            status: "editing_booking_draft",
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildBookingEditIntentReply(),
            booking: {
                status: "draft",
                draft: currentDraft,
                missingFields: getMissingFields(currentDraft)
            },
            draft: currentDraft,
            missingFields: getMissingFields(currentDraft),
            extractedSlots: {},
            packageIntent: { type: "none", package: null },
            nextExpectedField: "editTarget"
        });
    }
    if (session.lastBookingFailure && isLastBookingFailureQuestion(message)) {
        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildLastBookingFailureReply(session.lastBookingFailure),
            booking: {
                status: "draft",
                draft: currentDraft,
                missingFields: getMissingFields(currentDraft)
            },
            meta: {
                handledBy: "booking.service",
                sessionState: session.status,
                lastBookingFailure: session.lastBookingFailure,
                missingFields: getMissingFields(currentDraft),
                nextExpectedField: "appointmentTime"
            }
        });
    }

    const selectedSuggestedSlot = resolveSuggestedSlotSelection(
        message,
        session.lastBookingFailure?.suggestedSlots || []
    );
    const {
        slots: rawExtractedSlots,
        packageIntent,
        addressValidation: rawAddressValidation
    } = await extractBookingSlots(
        message,
        currentDraft
    );
    const extractedSlots = {
        ...rawExtractedSlots,
        ...(selectedSuggestedSlot
            ? {
                appointmentDate: selectedSuggestedSlot.date,
                appointmentTime: selectedSuggestedSlot.timeStart
            }
            : {})
    };

    if (extractedSlots.address) {
        const addressValidation = isLikelyAddressInput(extractedSlots.address);
        if (!addressValidation.valid) {
            delete extractedSlots.address;
        }
    }

    const extractedPhone = normalizePhone(extractedSlots.phoneNumber || "");

    if (sessionPhone && extractedPhone && extractedPhone !== sessionPhone) {
        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildDifferentPhoneReply(sessionPhone),
            booking: null,
            meta: {
                handledBy: "booking.service",
                sessionState: "phone_mismatch",
                authRequired: false,
                sessionPhone,
                rejectedPhone: extractedPhone
            }
        });
    }

    if (packageIntent.type === "ambiguous" && !currentDraft.selectedPackage) {
        const nextDraft = {
            ...currentDraft,
            ...extractedSlots,
            ...(sessionPhone ? { phoneNumber: sessionPhone } : {})
        };
        const missingFields = getMissingFields(nextDraft);

        return returnDraftResult({
            sessionId,
            message,
            status: "collecting_package",
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildCollectingReply(nextDraft, missingFields),
            booking: {
                status: "draft",
                draft: nextDraft,
                missingFields
            },
            draft: nextDraft,
            missingFields,
            extractedSlots,
            packageIntent,
            nextExpectedField: "testType"
        });
    }

    const nextDraft = {
        ...currentDraft,
        ...extractedSlots,
        ...(sessionPhone ? { phoneNumber: sessionPhone } : {})
    };
    const missingFields = getMissingFields(nextDraft);

    if (nextDraft.address) {
        const nextAddressValidation = isLikelyAddressInput(nextDraft.address);

        if (!nextAddressValidation.valid) {
            const addressDraft = {
                ...nextDraft,
                address: null,
                addressPartial: nextDraft.address
            };

            return returnDraftResult({
                sessionId,
                message,
                status: "collecting_info",
                action: ACTIONS.ASK_BOOKING_INFO,
                reply: nextAddressValidation.reason === "admin_only"
                    ? buildAdminOnlyAddressReply()
                    : buildAddressValidationReply(),
                booking: {
                    status: "draft",
                    draft: addressDraft,
                    missingFields: getAddressMissingFields(missingFields)
                },
                draft: addressDraft,
                missingFields: getAddressMissingFields(missingFields),
                extractedSlots,
                packageIntent,
                nextExpectedField: "address"
            });
        }
    }

    if (rawAddressValidation?.reason === "admin_only" && !extractedSlots.address) {
        return returnDraftResult({
            sessionId,
            message,
            status: "collecting_info",
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildAdminOnlyAddressReply(),
            booking: {
                status: "draft",
                draft: nextDraft,
                missingFields
            },
            draft: nextDraft,
            missingFields,
            extractedSlots,
            packageIntent,
            nextExpectedField: "address"
        });
    }

    if (
        rawAddressValidation &&
        !rawAddressValidation.needsCompletion &&
        !extractedSlots.address &&
        !extractedSlots.addressPartial &&
        getMissingFields(currentDraft)[0] === "address"
    ) {
        const addressMissingFields = getAddressMissingFields(missingFields);

        return returnDraftResult({
            sessionId,
            message,
            status: "collecting_info",
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildAddressValidationReasonReply(rawAddressValidation, message),
            booking: {
                status: "draft",
                draft: nextDraft,
                missingFields: addressMissingFields
            },
            draft: nextDraft,
            missingFields: addressMissingFields,
            extractedSlots,
            packageIntent,
            nextExpectedField: "address"
        });
    }

    if (extractedSlots.addressPartial && !extractedSlots.address) {
        const addressMissingFields = getAddressMissingFields(missingFields);

        return returnDraftResult({
            sessionId,
            message,
            status: "collecting_info",
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildAddressValidationReasonReply(
                rawAddressValidation,
                extractedSlots.addressPartial
            ),
            booking: {
                status: "draft",
                draft: nextDraft,
                missingFields: addressMissingFields
            },
            draft: nextDraft,
            missingFields: addressMissingFields,
            extractedSlots,
            packageIntent,
            nextExpectedField: "address"
        });
    }

    const changedAppointmentAfterSlotFailure = Boolean(
        session.lastBookingFailure &&
            (extractedSlots.appointmentDate || extractedSlots.appointmentTime) &&
            nextDraft.packageConfirmed === true &&
            missingFields.length === 0
    );

    if (changedAppointmentAfterSlotFailure) {
        try {
            await availabilitySlotService.assertSlotAvailable({
                sampleDate: nextDraft.appointmentDate,
                sampleTimeStart: nextDraft.appointmentTime
            });
        } catch (error) {
            if (!(error instanceof BookingRuntimeError)) {
                throw error;
            }

            return buildBookingFailureResult({
                error,
                sessionId,
                message,
                draft: nextDraft,
                extractedSlots,
                packageIntent
            });
        }
    }

    if (
        isConfirmationMessage(message) &&
        currentDraft.selectedPackage &&
        !currentDraft.packageConfirmed &&
        Object.keys(extractedSlots).length === 0
    ) {
        const confirmedDraft = {
            ...nextDraft,
            packageConfirmed: true
        };
        const confirmedMissingFields = getMissingFields(confirmedDraft);

        if (confirmedMissingFields.length > 0) {
            return returnDraftResult({
                sessionId,
                message,
                status: "collecting_info",
                action: ACTIONS.ASK_BOOKING_INFO,
                reply: buildCollectingReply(confirmedDraft, confirmedMissingFields),
                booking: {
                    status: "draft",
                    draft: confirmedDraft,
                    missingFields: confirmedMissingFields
                },
                draft: confirmedDraft,
                missingFields: confirmedMissingFields,
                extractedSlots,
                packageIntent,
                nextExpectedField: confirmedMissingFields[0]
            });
        }

        let createdBooking = null;

        const finalAddressValidation = isLikelyAddressInput(confirmedDraft.address || "");
        if (!finalAddressValidation.valid && confirmedDraft.address) {
            const addressDraft = {
                ...confirmedDraft,
                address: null,
                addressPartial: confirmedDraft.address
            };

            return returnDraftResult({
                sessionId,
                message,
                status: "collecting_info",
                action: ACTIONS.ASK_BOOKING_INFO,
                reply: finalAddressValidation.reason === "admin_only"
                    ? buildAdminOnlyAddressReply()
                    : buildAddressValidationReply(),
                booking: {
                    status: "draft",
                    draft: addressDraft,
                    missingFields: ["address"]
                },
                draft: addressDraft,
                missingFields: ["address"],
                extractedSlots,
                packageIntent,
                nextExpectedField: "address"
            });
        }

        try {
            createdBooking = await bookingRuntime.createConfirmedBooking(
                buildRuntimePayloadFromDraft(confirmedDraft),
                { sessionId, createdSource: "CHAT" }
            );
        } catch (error) {
            return buildBookingFailureResult({
                error,
                sessionId,
                message,
                draft: confirmedDraft,
                extractedSlots,
                packageIntent
            });

            const isSlotError = isBookingSlotError(error);

            return createChatResult({
                sessionId,
                userMessage: message,
                flow: FLOWS.BOOKING,
                action: ACTIONS.BOOKING_READY_TO_CONFIRM,
                reply: isSlotError
                    ? formatSlotErrorMessage(error, {
                        mode: "booking",
                        draft: confirmedDraft
                    })
                    : "MÃ¬nh chÆ°a thá»ƒ táº¡o lá»‹ch háº¹n vá»›i thÃ´ng tin hiá»‡n táº¡i. Báº¡n vui lÃ²ng kiá»ƒm tra láº¡i thÃ´ng tin Ä‘áº·t lá»‹ch hoáº·c liÃªn há»‡ HomeLab Ä‘á»ƒ Ä‘Æ°á»£c há»— trá»£.",
                booking: {
                    status: "pending_confirmation",
                    draft: confirmedDraft,
                    missingFields: []
                },
                meta: {
                    handledBy: "booking.service",
                    sessionState: "slot_blocked",
                    extractedSlots,
                    missingFields: [],
                    nextExpectedField: "appointmentTime",
                    selectedPackage: confirmedDraft.selectedPackage || null,
                    packageConfirmed: true,
                    ...(isSlotError ? {} : { errorCode: error.code })
                }
            });
        }

        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: null,
            status: "booking_created",
            bookingDraft: null,
            confirmedBookingId: null,
            lastBookingFailure: null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.BOOKING_CREATED,
            reply: buildCreatedReply(createdBooking),
            booking: createdBooking,
            meta: {
                handledBy: "booking.service",
                sessionState: updatedSession.status,
                extractedSlots,
                missingFields: [],
                nextExpectedField: null,
                selectedPackage: confirmedDraft.selectedPackage || null,
                packageConfirmed: true,
                confirmedBookingId: createdBooking.bookingCode
            }
        });
    }

    if (nextDraft.selectedPackage && !nextDraft.packageConfirmed) {
        const isMissingFields = missingFields.length > 0;
        const isUserConfirming = isConfirmationMessage(message);

        if (isMissingFields) {
            if (isConfirmationOnlyMessage(message)) {
                return returnDraftResult({
                    sessionId,
                    message,
                    status: "collecting_info",
                    action: ACTIONS.ASK_BOOKING_INFO,
                    reply: buildConfirmationOnlyBlockedReply(nextDraft, missingFields),
                    booking: {
                        status: "draft",
                        draft: nextDraft,
                        missingFields
                    },
                    draft: nextDraft,
                    missingFields,
                    extractedSlots,
                    packageIntent,
                    nextExpectedField: missingFields[0]
                });
            }

            return returnDraftResult({
                sessionId,
                message,
                status: "collecting_info",
                action: ACTIONS.ASK_BOOKING_INFO,
                reply: buildCollectingReply(nextDraft, missingFields),
                booking: {
                    status: "draft",
                    draft: nextDraft,
                    missingFields
                },
                draft: nextDraft,
                missingFields,
                extractedSlots,
                packageIntent,
                nextExpectedField: missingFields[0]
            });
        }

        if (!isUserConfirming) {
            return returnDraftResult({
                sessionId,
                message,
                status: "ready_for_confirmation",
                action: ACTIONS.BOOKING_READY_TO_CONFIRM,
                reply: buildReadyReply(nextDraft),
                booking: {
                    status: "pending_confirmation",
                    draft: nextDraft,
                    missingFields: []
                },
                draft: nextDraft,
                missingFields: [],
                extractedSlots,
                packageIntent,
                nextExpectedField: null
            });
        }

        if (isUserConfirming) {
            return returnDraftResult({
                sessionId,
                message,
                status: "confirming_package",
                action: ACTIONS.ASK_BOOKING_INFO,
                reply: buildPackageBookingConfirmationReply(nextDraft, true),
                booking: {
                    status: "draft",
                    draft: nextDraft,
                    missingFields
                },
                draft: nextDraft,
                missingFields,
                extractedSlots,
                packageIntent,
                nextExpectedField: "packageConfirmation"
            });
        }

        return returnDraftResult({
            sessionId,
            message,
            status: "collecting_info",
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildPackageBookingConfirmationReply(nextDraft, false),
            booking: {
                status: "draft",
                draft: nextDraft,
                missingFields
            },
            draft: nextDraft,
            missingFields,
            extractedSlots,
            packageIntent,
            nextExpectedField: missingFields[0] || null
        });
    }

    const currentDraftForCreate = {
        ...currentDraft,
        ...(sessionPhone ? { phoneNumber: sessionPhone } : {})
    };
    const canCreateFromConfirmation =
        isConfirmationMessage(message) &&
        currentDraftForCreate.packageConfirmed === true &&
        getMissingFields(currentDraftForCreate).length === 0 &&
        Object.keys(extractedSlots).length === 0;

    if (canCreateFromConfirmation) {
        let createdBooking = null;

        const finalAddressValidation = isLikelyAddressInput(currentDraftForCreate.address || "");
        if (!finalAddressValidation.valid && currentDraftForCreate.address) {
            const addressDraft = {
                ...currentDraftForCreate,
                address: null,
                addressPartial: currentDraftForCreate.address
            };

            return returnDraftResult({
                sessionId,
                message,
                status: "collecting_info",
                action: ACTIONS.ASK_BOOKING_INFO,
                reply: finalAddressValidation.reason === "admin_only"
                    ? buildAdminOnlyAddressReply()
                    : buildAddressValidationReply(),
                booking: {
                    status: "draft",
                    draft: addressDraft,
                    missingFields: ["address"]
                },
                draft: addressDraft,
                missingFields: ["address"],
                extractedSlots,
                packageIntent,
                nextExpectedField: "address"
            });
        }

        try {
            createdBooking = await bookingRuntime.createConfirmedBooking(
                buildRuntimePayloadFromDraft(currentDraftForCreate),
                { sessionId, createdSource: "CHAT" }
            );
        } catch (error) {
            return buildBookingFailureResult({
                error,
                sessionId,
                message,
                draft: currentDraftForCreate,
                extractedSlots,
                packageIntent
            });

            const isSlotError = isBookingSlotError(error);

            return createChatResult({
                sessionId,
                userMessage: message,
                flow: FLOWS.BOOKING,
                action: ACTIONS.BOOKING_READY_TO_CONFIRM,
                reply: isSlotError
                    ? formatSlotErrorMessage(error, {
                        mode: "booking",
                        draft: currentDraftForCreate
                    })
                    : "MÃ¬nh chÆ°a thá»ƒ táº¡o lá»‹ch háº¹n vá»›i thÃ´ng tin hiá»‡n táº¡i. Báº¡n vui lÃ²ng kiá»ƒm tra láº¡i thÃ´ng tin Ä‘áº·t lá»‹ch hoáº·c liÃªn há»‡ HomeLab Ä‘á»ƒ Ä‘Æ°á»£c há»— trá»£.",
                booking: {
                    status: "pending_confirmation",
                    draft: currentDraftForCreate,
                    missingFields: []
                },
                meta: {
                    handledBy: "booking.service",
                    sessionState: "slot_blocked",
                    extractedSlots,
                    missingFields: [],
                    nextExpectedField: "appointmentTime",
                    selectedPackage: currentDraftForCreate.selectedPackage || null,
                    packageConfirmed: true,
                    ...(isSlotError ? {} : { errorCode: error.code })
                }
            });
        }

        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: null,
            status: "booking_created",
            bookingDraft: null,
            confirmedBookingId: null,
            lastBookingFailure: null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.BOOKING_CREATED,
            reply: buildCreatedReply(createdBooking),
            booking: createdBooking,
            meta: {
                handledBy: "booking.service",
                sessionState: updatedSession.status,
                extractedSlots,
                missingFields: [],
                nextExpectedField: null,
                selectedPackage: currentDraftForCreate.selectedPackage || null,
                packageConfirmed: true,
                confirmedBookingId: createdBooking.bookingCode
            }
        });
    }

    let status = "collecting_info";
    let action = ACTIONS.ASK_BOOKING_INFO;
    let reply = buildCollectingReply(nextDraft, missingFields);
    let booking = {
        status: "draft",
        draft: nextDraft,
        missingFields
    };

    if (missingFields.length === 0) {
        status = "ready_for_confirmation";
        action = ACTIONS.BOOKING_READY_TO_CONFIRM;
        reply = buildReadyReply(nextDraft);
        booking = {
            status: "pending_confirmation",
            draft: nextDraft,
            missingFields: []
        };
    }

    return returnDraftResult({
        sessionId,
        message,
        status,
        action,
        reply,
        booking,
        draft: nextDraft,
        missingFields,
        extractedSlots,
        packageIntent,
        nextExpectedField: missingFields[0] || null
    });
}

module.exports = {
    handleBookingMessage,
    hasActiveBookingSession,
    shouldHandleBookingFailureFollowup,
    suspendActiveBookingSession
};
