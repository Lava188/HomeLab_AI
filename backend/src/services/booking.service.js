const mockSessions = require("../data/mockSessions");
const bookingRuntime = require("./booking-runtime/booking.service");
const availabilitySlotService = require("./booking-runtime/availability-slot.service");
const BookingRuntimeError = require("./booking-runtime/booking-runtime-error");
const { FLOWS, ACTIONS } = require("../constants/chat.constants");
const { createChatResult } = require("../utils/chat-response.util");
const { isBookingSlotError } = require("./booking-response.service");
const {
    normalizeText,
    detectDateFromMessage,
    detectInvalidDateFromMessage,
    detectTimeFromMessage,
    formatDisplayDate
} = require("../utils/text.util");
const { normalizePhone } = require("./booking-runtime/booking-validation.service");
const packageCatalog = require("./booking-package-catalog.service");
const {
    ACTS,
    classifyConversationAct
} = require("./booking-conversation-act.service");
const {
    classifySemanticIntent,
    classifySemanticIntentAsync,
    getProviderName
} = require("./conversation-intent-classifier.service");
const {
    buildSemanticReadonlyAssist,
    buildSemanticAssistMeta
} = require("./booking-semantic-readonly-assist.service");
const {
    arbitrateBookingSemanticReadOnly,
    buildSemanticArbitrationMeta
} = require("./booking-semantic-arbitration.service");

const NEARBY_SLOT_LOOKAHEAD_DAYS = 7;
const NEARBY_SLOT_LIMIT = 5;
const INTENT_CLASSIFIER_SHADOW_ASYNC_ENABLED_ENV = "HOMELAB_INTENT_CLASSIFIER_SHADOW_ASYNC_ENABLED";

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

const INFORMATIONAL_DETOUR_SIGNALS = [
    "la gi",
    "giai thich",
    "gom gi",
    "gom nhung gi",
    "bao gom gi",
    "bao gom",
    "y nghia",
    "xem chi tiet",
    "chi tiet"
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

const FIELD_SHORT_PROMPTS = {
    testType: "gói/xét nghiệm bạn muốn đặt",
    appointmentDate: "ngày lấy mẫu",
    appointmentTime: "giờ lấy mẫu",
    address: "địa chỉ lấy mẫu",
    patientName: "tên người đặt",
    phoneNumber: "số điện thoại liên hệ"
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
    "can tho", "cantho", "hue", "thua thien hue",
    "ha tinh"
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
        "Địa chỉ này chưa đủ rõ để nhân viên lấy mẫu đến đúng nơi. " +
        "Bạn vui lòng bổ sung phường/xã hoặc quận/huyện và tỉnh/thành phố. " +
        `Hiện bạn đã cung cấp: "${currentAddress}".`
    );
}

function buildAdminOnlyAddressReply() {
    return (
        "Mình đã ghi nhận khu vực hành chính, nhưng vẫn cần số nhà/tên đường hoặc thôn/xóm/ấp/tổ/khu cụ thể. " +
        "Bạn vui lòng nhập đầy đủ địa chỉ lấy mẫu. Ví dụ: 766 Đê La Thành, phường Giảng Võ, Hà Nội."
    );
}

function buildAddressValidationReply() {
    return "Địa chỉ lấy mẫu chưa đủ rõ. Bạn vui lòng cung cấp số nhà/tên đường hoặc thôn/xóm, phường/xã hoặc quận/huyện, tỉnh/thành phố.";
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
            `Địa chỉ${quotedText} chưa đủ rõ vì mới có số nhà, chưa có tên đường/thôn/xóm, ` +
            "phường/xã hoặc quận/huyện, tỉnh/thành phố. Bạn vui lòng nhập đầy đủ hơn, " +
            "ví dụ: 766 Đê La Thành, phường Giảng Võ, Hà Nội."
        );
    }

    if (validation?.reason === "missing_admin_division") {
        return (
            `Địa chỉ${quotedText} chưa đủ rõ vì còn thiếu phường/xã hoặc quận/huyện và tỉnh/thành phố. ` +
            "Bạn vui lòng bổ sung khu vực hành chính, ví dụ: 766 Đê La Thành, phường Giảng Võ, Hà Nội."
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
            `Mô tả địa chỉ${quotedText} chưa đủ chính xác để nhân viên đến lấy mẫu. ` +
            "Bạn vui lòng nhập số nhà/tên đường hoặc thôn/xóm, kèm phường/xã hoặc quận/huyện, tỉnh/thành phố."
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

function shouldReplacePartialAddress(partial, addition, validation) {
    if (!partial || !addition || !validation?.valid) {
        return false;
    }

    const normalizedPartial = normalizeText(partial);
    const normalizedAddition = normalizeText(addition);
    const partialValidation = isLikelyAddressInput(partial);

    if (normalizedAddition.includes(normalizedPartial)) {
        return true;
    }

    return Boolean(
        ["house_number_only", "missing_admin_division"].includes(partialValidation.reason) &&
            validation.hasHouseNumber &&
            validation.hasAdminKeyword
    );
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

    if (hasInformationalDetourIntent(message)) {
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

    if (hasConfirmationPrefix && isNearConfirmationOnlyText(trimmed)) {
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

function hasInformationalDetourIntent(message) {
    const normalizedMessage = normalizeText(message);

    return INFORMATIONAL_DETOUR_SIGNALS.some((signal) =>
        normalizedMessage.includes(signal)
    );
}

function isNearConfirmationOnlyText(trimmed) {
    const remaining = trimmed
        .replace(/^(xac nhan|dong y|ok|oke|dung roi|xong)\b/, "")
        .trim();

    if (!remaining) {
        return true;
    }

    return [
        "dat lich",
        "tao lich",
        "giup toi",
        "nhe",
        "a",
        "di"
    ].includes(remaining);
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
    const hasStructuredBookingSlot = Boolean(
        extracted.appointmentDate ||
            extracted.appointmentTime ||
            extracted.testType ||
            extracted.testCatalogItemId
    );

    let addressValidation = null;
    let addressPartialToMerge = currentDraft.addressPartial || null;

    if (address) {
        addressValidation = isLikelyAddressInput(address);

        if (addressValidation.valid) {
            if (addressPartialToMerge) {
                if (shouldReplacePartialAddress(addressPartialToMerge, address, addressValidation)) {
                    extracted.address = address;
                    extracted.addressPartial = null;
                    addressValidation = isLikelyAddressInput(address);
                } else {
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

    if (hasStructuredBookingSlot) {
        delete contextInference.address;
        delete contextInference.addressPartial;
    }

    if (contextInference.addressPartial && !addressValidation) {
        addressValidation = isLikelyAddressInput(contextInference.addressPartial);
    }

    if (contextInference.address && !extracted.address) {
        addressValidation = isLikelyAddressInput(contextInference.address);
        if (addressValidation.valid) {
            if (addressPartialToMerge) {
                if (shouldReplacePartialAddress(addressPartialToMerge, contextInference.address, addressValidation)) {
                    extracted.address = contextInference.address;
                    extracted.addressPartial = null;
                    addressValidation = isLikelyAddressInput(contextInference.address);
                } else {
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

    if (!hasStructuredBookingSlot && !extracted.address && !extracted.addressPartial) {
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

function buildKnownFieldsLines(draft) {
    const lines = [];

    if (draft.testType) lines.push(`- Gói: ${draft.testType}`);
    if (draft.appointmentDate) {
        lines.push(`- Ngày: ${formatDisplayDate(draft.appointmentDate)}`);
    }
    if (draft.appointmentTime) lines.push(`- Giờ: ${draft.appointmentTime}`);
    if (draft.phoneNumber) lines.push(`- Số điện thoại: ${draft.phoneNumber}`);
    if (draft.address) lines.push(`- Địa chỉ: ${draft.address}`);
    if (draft.patientName) lines.push(`- Tên người đặt: ${draft.patientName}`);

    return lines;
}

function buildMissingFieldsLines(missingFields) {
    return (missingFields || []).map((field) => `- ${FIELD_LABELS[field]}`);
}

function buildNextFieldInstruction(nextField) {
    if (nextField === "address") {
        return "Bạn gửi địa chỉ trước nhé.";
    }

    if (nextField === "appointmentTime") {
        return "Bạn chọn khung giờ giúp mình nhé.";
    }

    if (nextField === "patientName") {
        return "Bạn gửi tên người đặt giúp mình nhé.";
    }

    if (nextField === "phoneNumber") {
        return "Bạn gửi số điện thoại liên hệ giúp mình nhé.";
    }

    if (nextField === "appointmentDate") {
        return "Bạn chọn ngày lấy mẫu giúp mình nhé.";
    }

    if (nextField === "testType") {
        return "Bạn chọn gói/xét nghiệm giúp mình nhé.";
    }

    return "Bạn gửi tiếp thông tin còn thiếu giúp mình nhé.";
}

function buildAddressPromptReply() {
    return [
        "Mình đã có gói, ngày và giờ.",
        "Bạn gửi giúp mình địa chỉ lấy mẫu rõ ràng, gồm số nhà/tên đường, quận/huyện và tỉnh/thành phố.",
        "Ví dụ: 766 Đê La Thành, Đống Đa, Hà Nội."
    ].join("\n");
}

function buildTimeSlotPromptReply(draft, sameDaySlots) {
    return [
        `Mình đã ghi nhận gói ${draft.testType} vào ngày ${formatDisplayDate(draft.appointmentDate)}.`,
        "Ngày này còn các khung giờ:",
        ...sameDaySlots.map((slot) => `- ${slot.timeStart}`),
        "",
        "Bạn muốn chọn khung nào?"
    ].join("\n");
}

function buildDateChangedSlotReply(draft, sameDaySlots) {
    const lines = [
        `Mình đã đổi ngày lấy mẫu sang ${formatDisplayDate(draft.appointmentDate)}. Vì ngày thay đổi nên mình cần chọn lại giờ.`
    ];

    if (sameDaySlots.length) {
        lines.push(
            "Các khung giờ còn trống:",
            ...sameDaySlots.map((slot) => `- ${slot.timeStart}`),
            "",
            "Bạn muốn chọn khung nào?"
        );
    } else {
        lines.push("Hiện mình chưa thấy khung giờ trống trong ngày này. Bạn muốn chọn ngày khác không?");
    }

    return lines.join("\n");
}

function buildCollectingReply(draft, missingFields) {
    const knownFields = buildKnownFieldsText(draft);
    const nextField = missingFields[0];

    if (
        nextField === "address" &&
        draft.testType &&
        draft.appointmentDate &&
        draft.appointmentTime
    ) {
        return buildAddressPromptReply();
    }

    if (knownFields.length > 0) {
        return [
            `Mình đã ghi nhận: ${knownFields.join("; ")}.`,
            `Còn thiếu: ${FIELD_LABELS[nextField]}.`,
            `Bạn vui lòng gửi tiếp ${FIELD_SHORT_PROMPTS[nextField]}.`
        ].join("\n");
    }

    return `Bạn vui lòng gửi ${FIELD_PROMPTS[nextField]}.`;
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
    return `${formatDisplayDate(slot.date)} lúc ${slot.timeStart}`;
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

async function findAvailableSlotsForDraftDate(draft, limit = NEARBY_SLOT_LIMIT) {
    if (!draft?.appointmentDate) {
        return [];
    }

    return availabilitySlotService.findAvailableNearbySlots({
        requestedDate: draft.appointmentDate,
        area: null,
        days: 1,
        limit
    });
}

async function buildCollectingReplyWithAvailability(draft, missingFields) {
    const reply = buildCollectingReply(draft, missingFields);

    if (missingFields[0] !== "appointmentTime" || !draft.appointmentDate) {
        return reply;
    }

    const sameDaySlots = (await findAvailableSlotsForDraftDate(draft))
        .filter((slot) => slot.date === draft.appointmentDate);

    if (!sameDaySlots.length) {
        return reply;
    }

    if (draft.testType) {
        return buildTimeSlotPromptReply(draft, sameDaySlots);
    }

    return [reply, buildSuggestedSlotsText(sameDaySlots)].join("\n\n");
}

async function buildAvailabilityCheckReply(draft) {
    if (!draft?.appointmentDate) {
        return "Bạn muốn xem khung giờ trống cho ngày nào?";
    }

    const sameDaySlots = (await findAvailableSlotsForDraftDate(draft))
        .filter((slot) => slot.date === draft.appointmentDate);

    if (draft.appointmentTime) {
        const currentSlotText = `${formatDisplayDate(draft.appointmentDate)} lúc ${draft.appointmentTime}`;
        const slotsText = buildSuggestedSlotsText(sameDaySlots);

        return [
            `Bạn đang chọn khung ${currentSlotText}.`,
            slotsText || `Hiện mình chưa thấy khung giờ trống khác trong ngày ${formatDisplayDate(draft.appointmentDate)}.`,
            "Bạn muốn giữ khung giờ đang chọn hay đổi sang khung khác?"
        ].filter(Boolean).join("\n\n");
    }

    if (!sameDaySlots.length) {
        return `Hiện mình chưa thấy khung giờ trống trong ngày ${formatDisplayDate(draft.appointmentDate)}. Bạn muốn chọn ngày khác không?`;
    }

    return [
        `Các khung giờ còn trống trong ngày ${formatDisplayDate(draft.appointmentDate)}:`,
        ...sameDaySlots.map((slot) => `- ${slot.timeStart}`)
    ].join("\n");
}

async function getAvailableSlotsForDate(date) {
    if (!date) {
        return [];
    }

    return (await availabilitySlotService.findAvailableNearbySlots({
        requestedDate: date,
        area: null,
        days: 1,
        limit: 50
    })).filter((slot) => slot.date === date);
}

async function getNearbyAvailableSlots(date) {
    if (!date) {
        return [];
    }

    return availabilitySlotService.findAvailableNearbySlots({
        requestedDate: date,
        area: null,
        days: NEARBY_SLOT_LOOKAHEAD_DAYS,
        limit: NEARBY_SLOT_LIMIT
    });
}

function buildUnavailableTimeReply({ requestedDate, requestedTime, sameDaySlots, nearbySlots }) {
    const dateText = formatDisplayDate(requestedDate);

    if (sameDaySlots.length) {
        return [
            `Khung ${requestedTime} ngày ${dateText} hiện không khả dụng. Ngày này còn các khung:`,
            ...sameDaySlots.map((slot) => `- ${slot.timeStart}`),
            "",
            `Bạn muốn chọn ${sameDaySlots.map((slot) => slot.timeStart).join(", ")} hay đổi sang ngày khác?`
        ].join("\n");
    }

    if (nearbySlots.length) {
        return [
            `Ngày ${dateText} hiện không còn khung giờ phù hợp. Mình tìm thấy các khung gần nhất:`,
            ...nearbySlots.map((slot) => `- ${formatDisplayDate(slot.date)} lúc ${slot.timeStart}`),
            "",
            "Bạn muốn chọn một trong các khung trên hay đổi sang ngày khác?"
        ].join("\n");
    }

    return `Hiện HomeLab chưa tìm thấy khung giờ khả dụng gần ngày ${dateText}. Bạn muốn chọn ngày khác không?`;
}

async function isSelectedTimeAvailable(date, time) {
    try {
        await availabilitySlotService.assertSlotAvailable({
            sampleDate: date,
            sampleTimeStart: time
        });
        return true;
    } catch (error) {
        if (error instanceof BookingRuntimeError && isBookingSlotError(error)) {
            return false;
        }

        throw error;
    }
}

function buildInvalidDateReply(invalidDate) {
    const dateText = String(invalidDate?.input || "ngày bạn vừa nhập")
        .replace(/^ngày\s+/i, "");

    return `Ngày ${dateText} không hợp lệ. Bạn chọn lại ngày lấy mẫu giúp mình nhé, ví dụ 29/05/2026 hoặc 'ngày mai'.`;
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

    return [
        "Mình chưa thể tạo lịch vì hệ thống đang gặp lỗi khi lưu lịch.",
        "Mình vẫn giữ bản nháp đặt lịch hiện tại của bạn. Bạn thử xác nhận lại sau ít phút hoặc liên hệ HomeLab để được hỗ trợ."
    ].join("\n\n");
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
        return "Số điện thoại liên hệ chưa hợp lệ. Bạn vui lòng cung cấp số điện thoại Việt Nam hợp lệ, ví dụ: 0912345678.";
    }

    if (field === "sampleDate") {
        return "Ngày lấy mẫu chưa hợp lệ hoặc đã ở quá khứ. Bạn vui lòng chọn ngày lấy mẫu khác.";
    }

    if (field === "sampleTimeStart") {
        return "Giờ lấy mẫu chưa hợp lệ. Bạn vui lòng nhập lại giờ lấy mẫu, ví dụ: 7h30, 8h hoặc 14:00.";
    }

    if (field === "patientName") {
        return "Tên người đặt chưa hợp lệ. Bạn vui lòng cung cấp họ tên người đặt lịch.";
    }

    if (field === "testType") {
        return `Gói/xét nghiệm chưa hợp lệ. Bạn vui lòng chọn một gói HomeLab đang hỗ trợ: ${packageCatalog.buildPackageListText()}.`;
    }

    return error?.message
        ? `Mình chưa thể tạo lịch vì ${error.message}.`
        : "Mình chưa thể tạo lịch vì thông tin đặt lịch chưa hợp lệ.";
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
        lastBookingFailure?.message || "Lịch chưa được tạo vì thông tin đặt lịch hiện tại chưa thể xác nhận.",
        "Mình vẫn giữ bản nháp đặt lịch của bạn.",
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
    packageIntent,
    conversationAct = null
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
                    nextExpectedField: "address",
                    conversationAct
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
                    nextExpectedField: missingFields[0] || null,
                    conversationAct
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
                nextExpectedField: "appointmentTime",
                conversationAct
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
    const nextField = missingFields[0];
    const missingText = nextField === "appointmentTime"
        ? "khung giờ hợp lệ"
        : FIELD_LABELS[nextField].toLowerCase();

    return [
        "Mình hiểu. Tuy nhiên lịch vẫn chưa đủ thông tin để tạo.",
        `Hiện còn thiếu ${missingText}.`,
        buildNextFieldInstruction(nextField)
    ].join(" ");
}

function getPackageChoiceDisplayName(packageItem) {
    const name = String(packageItem?.name || "").replace(/^Gói\s+/i, "").trim();
    return name ? `${name.charAt(0).toUpperCase()}${name.slice(1)}` : name;
}

function buildInformationalDetourReply(packageItem, draft, missingFields, options = {}) {
    const detail = packageCatalog.buildPackageDetailReply(packageItem);
    const nextField = missingFields[0];
    const followUp = options.packageFromMessage && nextField === "testType"
        ? `Bạn muốn chọn gói ${getPackageChoiceDisplayName(packageItem)} cho lịch này không?`
        : nextField
        ? `Mình vẫn giữ bản nháp đặt lịch. Nếu muốn tiếp tục, ${buildNextFieldInstruction(nextField).toLowerCase()}`
        : "Mình vẫn giữ bản nháp đặt lịch. Nếu thông tin đã đúng, bạn trả lời 'Xác nhận đặt lịch' để mình tạo lịch.";

    return [detail, followUp].join("\n\n");
}

async function resolveBookingInformationalDetour(message, currentDraft) {
    if (!hasInformationalDetourIntent(message)) {
        return null;
    }

    const packageIntent = await packageCatalog.resolvePackageIntent(message);
    const packageFromMessage = packageIntent.package || null;
    const packageFromDraft = currentDraft.selectedPackage || null;
    const targetPackage = packageFromMessage || packageFromDraft;

    if (!targetPackage) {
        return null;
    }

    return {
        packageIntent: packageFromMessage
            ? {
                ...packageIntent,
                type: "detail_question"
            }
            : {
                type: "detail_question",
                package: targetPackage,
                candidates: []
            },
        packageItem: targetPackage,
        packageFromMessage: Boolean(packageFromMessage)
    };
}

function buildNoActiveDraftConfirmationReply() {
    return (
        "Mình chưa có thông tin lịch hẹn nào đang chờ xác nhận trong phiên chat này. " +
        "Bạn vui lòng cung cấp thông tin đặt lịch gồm gói xét nghiệm, ngày giờ lấy mẫu, địa chỉ và thông tin liên hệ."
    );
}

function buildBookingEditIntentReply() {
    return "Bạn muốn đổi gói xét nghiệm, ngày giờ lấy mẫu, địa chỉ hay thông tin người đặt?";
}

function buildPauseReply(draft, missingFields) {
    if (!missingFields.length) {
        return "Oke, lịch chưa được tạo. Mình vẫn giữ bản nháp này; khi nào muốn đặt, bạn nhắn xác nhận đặt lịch này nhé.";
    }

    if (draft?.testType && draft?.appointmentDate && !draft?.appointmentTime) {
        return "Oke, mình vẫn giữ thông tin gói và ngày lấy mẫu. Khi nào muốn tiếp tục, bạn có thể chọn một trong các khung giờ còn trống hoặc nhắn ngày khác.";
    }

    if (buildKnownFieldsText(draft).length > 0) {
        return "Oke, mình vẫn giữ bản nháp đặt lịch của bạn. Khi nào muốn tiếp tục, bạn chỉ cần nhắn tiếp tục đặt lịch hoặc chọn khung giờ phù hợp nhé.";
    }

    return "Oke, mình sẽ chờ bạn. Khi nào muốn đặt lịch, bạn chỉ cần nhắn tiếp tục đặt lịch nhé.";
}

function buildPausedResumeReconfirmReply() {
    return (
        "Bạn muốn tiếp tục xác nhận lịch vừa tạm dừng đúng không? " +
        "Nếu đúng, hãy trả lời 'Đúng, xác nhận lịch này'."
    );
}

function buildCancelDraftConfirmReply() {
    return "Bạn muốn hủy bản nháp đặt lịch này đúng không? Nếu đúng, hãy trả lời 'Đúng hủy bản nháp'.";
}

function buildUnclearBookingDraftReply() {
    return "Ý bạn là muốn tiếp tục đặt lịch, sửa thông tin, hay hỏi thêm về gói xét nghiệm?";
}

function buildUnclearMissingFieldReply(missingFields) {
    const nextField = missingFields[0];

    return [
        "Mình hiểu. Tuy nhiên lịch vẫn chưa đủ thông tin để tạo.",
        `Hiện còn thiếu ${FIELD_LABELS[nextField].toLowerCase()}.`,
        buildNextFieldInstruction(nextField)
    ].join(" ");
}

function buildReviewDraftReply(draft, missingFields) {
    const knownLines = buildKnownFieldsLines(draft);
    const missingLines = buildMissingFieldsLines(missingFields);

    return [
        "Mình đang có:",
        ...(knownLines.length ? knownLines : ["- Chưa có thông tin nào"]),
        "",
        ...(missingLines.length
            ? ["Còn thiếu:", ...missingLines, "", buildNextFieldInstruction(missingFields[0])]
            : ["Bản nháp đã đủ thông tin, nhưng lịch chưa được tạo.", "Nếu muốn tạo lịch, bạn trả lời rõ 'Xác nhận đặt lịch'."])
    ].join("\n");
}

function buildHelpNextStepReply(draft, missingFields) {
    if (missingFields.length > 0) {
        return buildReviewDraftReply(draft, missingFields);
    }

    return buildReviewDraftReply(draft, missingFields);
}

function buildEditTimeConfirmationReply(timeValue) {
    return `Bạn muốn đổi giờ lấy mẫu sang ${timeValue} đúng không?`;
}

function buildEditConfirmationReply(edit) {
    if (!edit?.field) {
        return buildBookingEditIntentReply();
    }

    if (edit.field === "appointmentTime") {
        return `Bạn muốn đổi giờ lấy mẫu sang ${edit.value} đúng không?`;
    }

    if (edit.field === "appointmentDate") {
        return `Bạn muốn đổi ngày lấy mẫu sang ${formatDisplayDate(edit.value)} đúng không?`;
    }

    if (edit.field === "address") {
        return `Bạn muốn đổi địa chỉ lấy mẫu sang "${edit.value}" đúng không?`;
    }

    if (edit.field === "patientName") {
        return `Bạn muốn đổi tên người đặt sang "${edit.value}" đúng không?`;
    }

    if (edit.field === "testType") {
        return `Bạn muốn đổi gói xét nghiệm sang ${edit.displayValue || edit.value} đúng không?`;
    }

    return buildBookingEditIntentReply();
}

function buildPendingEditRejectedReply(draft, missingFields) {
    const prefix = "Mình sẽ giữ thông tin cũ trong bản nháp.";

    if (missingFields.length > 0) {
        return `${prefix} ${buildCollectingReply(draft, missingFields)}`;
    }

    return `${prefix} ${buildReadyReply(draft)}`;
}

async function normalizePendingDraftEdit(edit) {
    if (!edit?.field) {
        return edit;
    }

    if (edit.field !== "testType") {
        return edit;
    }

    const packageIntent = await packageCatalog.resolvePackageIntent(edit.value || "");

    if (packageIntent.type !== "selected" || !packageIntent.package) {
        return {
            ...edit,
            value: edit.value,
            displayValue: edit.value
        };
    }

    return {
        ...edit,
        value: packageIntent.package.name,
        displayValue: packageIntent.package.name,
        packageIntent,
        packageSlots: {
            testType: packageIntent.package.name,
            testCatalogItemId: packageIntent.package.id,
            selectedPackage: packageIntent.package,
            packageConfirmed: false
        }
    };
}

function applyPendingDraftEdit(draft, edit) {
    if (edit?.field === "testType" && edit.packageSlots) {
        return {
            ...draft,
            ...edit.packageSlots
        };
    }

    if (!edit?.field) {
        return draft;
    }

    return {
        ...draft,
        [edit.field]: edit.value
    };
}

function buildDraftCancelledReply() {
    return "Mình đã hủy bản nháp đặt lịch này. Khi cần đặt lịch mới, bạn chỉ cần gửi lại thông tin gói xét nghiệm, ngày giờ lấy mẫu, địa chỉ và tên người đặt.";
}

function buildDifferentPhoneReply(sessionPhone) {
    return `Lịch hẹn sẽ được tạo theo số điện thoại tài khoản đang đăng nhập: ${sessionPhone}. Nếu bạn muốn đặt cho số khác, vui lòng đăng xuất và đăng nhập bằng tài khoản phù hợp.`;
}

function buildCreatedReply(booking) {
    return (
        `Đã tạo lịch hẹn thành công. Mã đặt lịch của bạn là ${booking.bookingCode}.\n` +
        "Thông tin lịch:\n" +
        `- Gói: ${booking.testName || booking.testTypeText}\n` +
        `- Ngày giờ: ${formatDisplayDate(booking.sampleDate)} ${booking.sampleTimeStart}\n` +
        `- Địa chỉ: ${booking.address}\n` +
        `- Người đặt: ${booking.patientName}\n` +
        `- Số điện thoại: ${booking.phone}\n\n` +
        "Bạn có thể lưu lại mã đặt lịch để tra cứu khi cần."
    );
}

function isConfirmationMessage(message) {
    const normalizedMessage = normalizeText(message);
    const trimmed = normalizedMessage.trim();

    if (
        !trimmed ||
        hasBookingEditOrNegativeIntent(message) ||
        hasInformationalDetourIntent(message)
    ) {
        return false;
    }

    if (EXPLICIT_CONFIRMATION_SIGNALS.includes(trimmed)) {
        return true;
    }

    return EXPLICIT_CONFIRMATION_SIGNALS.some((keyword) =>
        normalizedMessage.startsWith(`${keyword} `) &&
            isNearConfirmationOnlyText(trimmed)
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
    nextExpectedField,
    conversationAct = null
}) {
    const ruleAct = getRuleConversationAct(conversationAct);
    const semanticShadow = conversationAct?.semanticShadow || null;
    const semanticArbitration = conversationAct?.semanticArbitration || null;
    const fieldPromptUsed = REQUIRED_FIELDS.includes(nextExpectedField);

    return {
        handledBy: "booking.service",
        sessionState: updatedSession.status,
        extractedSlots,
        missingFields,
        nextExpectedField: nextExpectedField || null,
        currentTurnIntentUsed: ruleAct?.act || null,
        currentTurnIntentSource: ruleAct ? "booking_conversation_act.rule" : null,
        ...(fieldPromptUsed
            ? { whyMissingFieldPromptUsed: `missing_${nextExpectedField}` }
            : {}),
        ...(semanticShadow?.fallbackReason
            ? { semanticFallbackReason: semanticShadow.fallbackReason }
            : {}),
        ...(semanticArbitration ? { semanticArbitration } : {}),
        confirmedBookingId: updatedSession.confirmedBookingId || null,
        packageIntent: packageIntent?.type || null,
        packageCandidates:
            packageIntent?.type === "ambiguous" ? packageIntent.candidates : undefined,
        selectedPackage:
            packageIntent?.package || updatedSession.bookingDraft?.selectedPackage || null,
        packageConfirmed:
            Boolean(updatedSession.bookingDraft?.packageConfirmed),
        ...(conversationAct ? { conversationAct } : {})
    };
}

function getRuleConversationAct(conversationAct) {
    return conversationAct?.rule || conversationAct || null;
}

function compareConversationActs(ruleAct, semanticShadow) {
    if (!ruleAct || !semanticShadow) {
        return {
            match: false,
            disagreementReason: semanticShadow
                ? "rule_or_semantic_missing"
                : "semantic_classifier_unavailable"
        };
    }

    if (semanticShadow.safetyDecision === "block_mutation") {
        return {
            match: false,
            disagreementReason: "semantic_shadow_safety_block_differs_from_rule"
        };
    }

    if (ruleAct.act === semanticShadow.conversationAct) {
        return {
            match: true,
            disagreementReason: null
        };
    }

    if (ruleAct.act === ACTS.FINAL_CONFIRM && semanticShadow.conversationAct === ACTS.EDIT_REQUEST) {
        return {
            match: false,
            disagreementReason: "semantic_shadow_prioritized_edit_over_confirmation"
        };
    }

    return {
        match: false,
        disagreementReason: `rule_${ruleAct.act || "unknown"}_semantic_${semanticShadow.conversationAct || "unknown"}`
    };
}

function isIntentClassifierShadowAsyncEnabled(env = process.env) {
    return String(env[INTENT_CLASSIFIER_SHADOW_ASYNC_ENABLED_ENV] || "")
        .trim()
        .toLowerCase() === "true";
}

function buildConversationActShadowMeta(ruleAct, semanticShadow, options = {}) {
    const comparison = compareConversationActs(ruleAct, semanticShadow);

    return {
        ...(ruleAct || {}),
        rule: ruleAct || null,
        semanticShadow: semanticShadow || null,
        match: comparison.match,
        disagreementReason: comparison.disagreementReason,
        ...(Object.prototype.hasOwnProperty.call(options, "semanticShadowAvailable")
            ? { semanticShadowAvailable: options.semanticShadowAvailable }
            : {}),
        ...(Object.prototype.hasOwnProperty.call(options, "shadowAsyncEnabled")
            ? { shadowAsyncEnabled: options.shadowAsyncEnabled }
            : {}),
        ...(Object.prototype.hasOwnProperty.call(options, "shadowProvider")
            ? { shadowProvider: options.shadowProvider }
            : {})
    };
}

async function buildConversationActShadowMetaAsync(ruleAct, classifierInput) {
    const shadowProvider = getProviderName();
    const semanticShadow = await classifySemanticIntentAsync({
        ...classifierInput,
        ruleAct
    });

    return buildConversationActShadowMeta(ruleAct, semanticShadow, {
        semanticShadowAvailable: Boolean(semanticShadow),
        shadowAsyncEnabled: true,
        shadowProvider
    });
}

function withConversationActMeta(conversationAct, overrides = {}) {
    const ruleAct = {
        ...(getRuleConversationAct(conversationAct) || {}),
        ...overrides
    };
    const semanticShadow = conversationAct?.semanticShadow || null;
    const metaOptions = {};

    for (const key of ["semanticShadowAvailable", "shadowAsyncEnabled", "shadowProvider"]) {
        if (Object.prototype.hasOwnProperty.call(conversationAct || {}, key)) {
            metaOptions[key] = conversationAct[key];
        }
    }

    return buildConversationActShadowMeta(ruleAct, semanticShadow, metaOptions);
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
    nextExpectedField,
    conversationAct = null
}) {
    await persistDraft(sessionId, draft, missingFields);

    const updatedSession = mockSessions.upsertSession(sessionId, {
        currentFlow: FLOWS.BOOKING,
        status,
        bookingDraft: draft,
        confirmedBookingId: null,
        lastBookingFailure: null,
        pendingDraftEdit: null,
        pendingDraftCancel: null
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
            nextExpectedField,
            conversationAct
        })
    });
}

async function createBookingFromDraft({
    sessionId,
    message,
    draft,
    extractedSlots = {},
    packageIntent = { type: "none", package: null },
    conversationAct = null
}) {
    const confirmedDraft = {
        ...draft,
        packageConfirmed: true
    };

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
            nextExpectedField: "address",
            conversationAct
        });
    }

    let createdBooking = null;

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
            packageIntent,
            conversationAct
        });
    }

    const updatedSession = mockSessions.upsertSession(sessionId, {
        currentFlow: null,
        status: "booking_created",
        bookingDraft: null,
        confirmedBookingId: null,
        lastBookingFailure: null,
        pendingDraftEdit: null,
        pendingDraftCancel: null
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
            currentTurnIntentUsed: getRuleConversationAct(conversationAct)?.act || null,
            currentTurnIntentSource: conversationAct ? "booking_conversation_act.rule" : null,
            selectedPackage: confirmedDraft.selectedPackage || null,
            packageConfirmed: true,
            confirmedBookingId: createdBooking.bookingCode,
            ...(conversationAct ? { conversationAct } : {})
        }
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
    const currentMissingFields = getMissingFields(currentDraft);
    const conversationAct = classifyConversationAct({
        message,
        session,
        draft: currentDraft,
        missingFields: currentMissingFields
    });
    const semanticClassifierInput = {
        message,
        sessionContext: session,
        draft: currentDraft,
        lastBotAction: session.status || null,
        domainContext: {
            missingFields: currentMissingFields,
            nextExpectedField: currentMissingFields[0] || null,
            selectedPackage: currentDraft.selectedPackage || null,
            pendingDraftEdit: session.pendingDraftEdit || null,
            pendingDraftCancel: session.pendingDraftCancel || null
        }
    };
    const shadowAsyncEnabled = isIntentClassifierShadowAsyncEnabled();
    const conversationActMeta = shadowAsyncEnabled
        ? await buildConversationActShadowMetaAsync(conversationAct, semanticClassifierInput)
        : buildConversationActShadowMeta(
            conversationAct,
            classifySemanticIntent(semanticClassifierInput),
            {
                semanticShadowAvailable: true,
                shadowAsyncEnabled: false,
                shadowProvider: getProviderName()
            }
        );
    const semanticArbitration = arbitrateBookingSemanticReadOnly({
        ruleAct: conversationAct,
        semanticShadow: conversationActMeta.semanticShadow,
        draft: currentDraft,
        missingFields: currentMissingFields,
        sessionStatus: session.status || null,
        lastBotAction: session.status || null,
        selectedPackage: currentDraft.selectedPackage || null
    });
    conversationActMeta.semanticArbitration = buildSemanticArbitrationMeta(semanticArbitration);
    const invalidDate = detectInvalidDateFromMessage(message);

    if (invalidDate) {
        await persistDraft(sessionId, currentDraft, currentMissingFields);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: session.status || "collecting_info",
            bookingDraft: currentDraft,
            confirmedBookingId: null,
            lastBookingFailure: session.lastBookingFailure || null,
            pendingDraftEdit: session.pendingDraftEdit || null,
            pendingDraftCancel: session.pendingDraftCancel || null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildInvalidDateReply(invalidDate),
            booking: {
                status: currentMissingFields.length ? "draft" : "pending_confirmation",
                draft: currentDraft,
                missingFields: currentMissingFields
            },
            meta: buildBookingMeta({
                updatedSession,
                extractedSlots: {},
                packageIntent: { type: "none", package: null },
                missingFields: currentMissingFields,
                nextExpectedField: "appointmentDate",
                conversationAct: withConversationActMeta(conversationActMeta, {
                    currentTurnBlockedReason: "invalid_date"
                })
            })
        });
    }

    if (
        semanticArbitration.shouldUseSemantic &&
        semanticArbitration.selectedAct === "availability_inquiry"
    ) {
        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: await buildAvailabilityCheckReply(currentDraft),
            booking: {
                status: currentMissingFields.length ? "draft" : "pending_confirmation",
                draft: currentDraft,
                missingFields: currentMissingFields
            },
            meta: buildBookingMeta({
                updatedSession: session,
                extractedSlots: {},
                packageIntent: { type: "none", package: null },
                missingFields: currentMissingFields,
                nextExpectedField: currentMissingFields[0] || null,
                conversationAct: conversationActMeta
            })
        });
    }

    const semanticAssist = await buildSemanticReadonlyAssist({
        ruleAct: conversationAct,
        semanticShadow: conversationActMeta.semanticShadow,
        draft: currentDraft,
        sessionState: session.status || null,
        lastBotAction: session.status || null,
        message,
        context: {
            ...semanticClassifierInput.domainContext,
            missingFields: currentMissingFields
        }
    });
    conversationActMeta.semanticAssist = buildSemanticAssistMeta(semanticAssist);

    if (
        semanticAssist.enabled &&
        semanticAssist.reply &&
        conversationAct.act !== ACTS.PAUSE_OR_HOLD
    ) {
        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: semanticAssist.reply,
            booking: {
                status: currentMissingFields.length ? "draft" : "pending_confirmation",
                draft: currentDraft,
                missingFields: currentMissingFields
            },
            meta: buildBookingMeta({
                updatedSession: session,
                extractedSlots: {},
                packageIntent: semanticAssist.meta?.packageIntent || { type: "none", package: null },
                missingFields: currentMissingFields,
                nextExpectedField: currentMissingFields[0] || null,
                conversationAct: conversationActMeta
            })
        });
    }

    if (
        session.pendingDraftCancel &&
        conversationAct.act === ACTS.CANCEL_OR_ABORT &&
        conversationAct.confidence >= 0.8 &&
        conversationAct.reason === "explicit_cancel_draft_confirmation_in_pending_cancel_context"
    ) {
        await bookingRuntime.clearDraft(sessionId);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: null,
            status: "booking_closed",
            bookingDraft: null,
            confirmedBookingId: null,
            lastBookingFailure: null,
            pendingDraftEdit: null,
            pendingDraftCancel: null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildDraftCancelledReply(),
            booking: null,
            meta: {
                handledBy: "booking.service",
                sessionState: updatedSession.status,
                missingFields: [],
                nextExpectedField: null,
                conversationAct: conversationActMeta
            }
        });
    }

    if (conversationAct.act === ACTS.PAUSE_OR_HOLD) {
        await persistDraft(sessionId, currentDraft, currentMissingFields);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: "booking_paused",
            bookingDraft: currentDraft,
            confirmedBookingId: null,
            lastBookingFailure: null,
            pendingDraftEdit: null,
            pendingDraftCancel: null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildPauseReply(currentDraft, currentMissingFields),
            booking: {
                status: currentMissingFields.length ? "draft" : "pending_confirmation",
                draft: currentDraft,
                missingFields: currentMissingFields
            },
            meta: buildBookingMeta({
                updatedSession,
                extractedSlots: {},
                packageIntent: { type: "none", package: null },
                missingFields: currentMissingFields,
                nextExpectedField: currentMissingFields[0] || null,
                conversationAct: conversationActMeta
            })
        });
    }

    if (
        conversationAct.act === ACTS.RESUME_AFTER_PAUSE &&
        conversationAct.resumeMode === "needs_reconfirm"
    ) {
        await persistDraft(sessionId, currentDraft, currentMissingFields);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: "booking_paused",
            bookingDraft: currentDraft,
            confirmedBookingId: null,
            lastBookingFailure: null,
            pendingDraftEdit: null,
            pendingDraftCancel: null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildPausedResumeReconfirmReply(),
            booking: {
                status: currentMissingFields.length ? "draft" : "pending_confirmation",
                draft: currentDraft,
                missingFields: currentMissingFields
            },
            meta: buildBookingMeta({
                updatedSession,
                extractedSlots: {},
                packageIntent: { type: "none", package: null },
                missingFields: currentMissingFields,
                nextExpectedField: currentMissingFields[0] || null,
                conversationAct: conversationActMeta
            })
        });
    }

    if (
        conversationAct.act === ACTS.RESUME_AFTER_PAUSE &&
        conversationAct.resumeMode === "continue"
    ) {
        if (currentMissingFields.length > 0) {
            return returnDraftResult({
                sessionId,
                message,
                status: "collecting_info",
                action: ACTIONS.ASK_BOOKING_INFO,
                reply: await buildCollectingReplyWithAvailability(currentDraft, currentMissingFields),
                booking: {
                    status: "draft",
                    draft: currentDraft,
                    missingFields: currentMissingFields
                },
                draft: currentDraft,
                missingFields: currentMissingFields,
                extractedSlots: {},
                packageIntent: { type: "none", package: null },
                nextExpectedField: currentMissingFields[0],
                conversationAct: conversationActMeta
            });
        }

        return returnDraftResult({
            sessionId,
            message,
            status: "ready_for_confirmation",
            action: ACTIONS.BOOKING_READY_TO_CONFIRM,
            reply: buildReadyReply(currentDraft),
            booking: {
                status: "pending_confirmation",
                draft: currentDraft,
                missingFields: []
            },
            draft: currentDraft,
            missingFields: [],
            extractedSlots: {},
            packageIntent: currentDraft.selectedPackage
                ? { type: "selected", package: currentDraft.selectedPackage }
                : { type: "none", package: null },
            nextExpectedField: null,
            conversationAct: conversationActMeta
        });
    }

    if (
        conversationAct.act === ACTS.RESUME_AFTER_PAUSE &&
        conversationAct.resumeMode === "explicit"
    ) {
        if (currentMissingFields.length > 0) {
            return returnDraftResult({
                sessionId,
                message,
                status: "collecting_info",
                action: ACTIONS.ASK_BOOKING_INFO,
                reply: await buildCollectingReplyWithAvailability(currentDraft, currentMissingFields),
                booking: {
                    status: "draft",
                    draft: currentDraft,
                    missingFields: currentMissingFields
                },
                draft: currentDraft,
                missingFields: currentMissingFields,
                extractedSlots: {},
                packageIntent: { type: "none", package: null },
                nextExpectedField: currentMissingFields[0],
                conversationAct: conversationActMeta
            });
        }

        return createBookingFromDraft({
            sessionId,
            message,
            draft: {
                ...currentDraft,
                ...(sessionPhone ? { phoneNumber: sessionPhone } : {})
            },
            extractedSlots: {},
            packageIntent: currentDraft.selectedPackage
                ? { type: "selected", package: currentDraft.selectedPackage }
                : { type: "none", package: null },
            conversationAct: conversationActMeta
        });
    }

    if (
        conversationAct.act === ACTS.EDIT_REQUEST &&
        conversationAct.editMode === "confirm_pending" &&
        conversationAct.edit?.field
    ) {
        const editedDraft = applyPendingDraftEdit(currentDraft, conversationAct.edit);
        const editedMissingFields = getMissingFields(editedDraft);

        return returnDraftResult({
            sessionId,
            message,
            status: editedMissingFields.length ? "collecting_info" : "ready_for_confirmation",
            action: editedMissingFields.length
                ? ACTIONS.ASK_BOOKING_INFO
                : ACTIONS.BOOKING_READY_TO_CONFIRM,
            reply: editedMissingFields.length
                ? await buildCollectingReplyWithAvailability(editedDraft, editedMissingFields)
                : buildReadyReply(editedDraft),
            booking: {
                status: editedMissingFields.length ? "draft" : "pending_confirmation",
                draft: editedDraft,
                missingFields: editedMissingFields
            },
            draft: editedDraft,
            missingFields: editedMissingFields,
            extractedSlots: {
                [conversationAct.edit.field]: conversationAct.edit.value
            },
            packageIntent: conversationAct.edit.packageIntent || { type: "none", package: null },
            nextExpectedField: editedMissingFields[0] || null,
            conversationAct: conversationActMeta
        });
    }

    if (
        conversationAct.act === ACTS.EDIT_REQUEST &&
        conversationAct.editMode === "reject_pending"
    ) {
        await persistDraft(sessionId, currentDraft, currentMissingFields);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: currentMissingFields.length ? "collecting_info" : "ready_for_confirmation",
            bookingDraft: currentDraft,
            confirmedBookingId: null,
            lastBookingFailure: null,
            pendingDraftEdit: null,
            pendingDraftCancel: null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: currentMissingFields.length
                ? ACTIONS.ASK_BOOKING_INFO
                : ACTIONS.BOOKING_READY_TO_CONFIRM,
            reply: buildPendingEditRejectedReply(currentDraft, currentMissingFields),
            booking: {
                status: currentMissingFields.length ? "draft" : "pending_confirmation",
                draft: currentDraft,
                missingFields: currentMissingFields
            },
            meta: buildBookingMeta({
                updatedSession,
                extractedSlots: {},
                packageIntent: { type: "none", package: null },
                missingFields: currentMissingFields,
                nextExpectedField: currentMissingFields[0] || null,
                conversationAct: conversationActMeta
            })
        });
    }

    if (
        conversationAct.act === ACTS.EDIT_REQUEST &&
        conversationAct.editMode === "clarify_pending"
    ) {
        await persistDraft(sessionId, currentDraft, currentMissingFields);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: "editing_booking_draft",
            bookingDraft: currentDraft,
            confirmedBookingId: null,
            lastBookingFailure: null,
            pendingDraftEdit: session.pendingDraftEdit,
            pendingDraftCancel: null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: conversationAct.suggestedNextQuestion,
            booking: {
                status: currentMissingFields.length ? "draft" : "pending_confirmation",
                draft: currentDraft,
                missingFields: currentMissingFields
            },
            meta: buildBookingMeta({
                updatedSession,
                extractedSlots: {},
                packageIntent: { type: "none", package: null },
                missingFields: currentMissingFields,
                nextExpectedField: "editConfirmation",
                conversationAct: conversationActMeta
            })
        });
    }

    if (
        conversationAct.act === ACTS.EDIT_REQUEST &&
        conversationAct.editMode === "propose_change" &&
        conversationAct.edit?.field
    ) {
        const pendingDraftEdit = await normalizePendingDraftEdit(conversationAct.edit);
        await persistDraft(sessionId, currentDraft, currentMissingFields);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: "editing_booking_draft",
            bookingDraft: currentDraft,
            confirmedBookingId: null,
            lastBookingFailure: null,
            pendingDraftEdit,
            pendingDraftCancel: null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildEditConfirmationReply(pendingDraftEdit),
            booking: {
                status: currentMissingFields.length ? "draft" : "pending_confirmation",
                draft: currentDraft,
                missingFields: currentMissingFields
            },
            meta: buildBookingMeta({
                updatedSession,
                extractedSlots: {},
                packageIntent: { type: "none", package: null },
                missingFields: currentMissingFields,
                nextExpectedField: "editConfirmation",
                conversationAct: withConversationActMeta(conversationActMeta, {
                    edit: pendingDraftEdit,
                    targetValue: pendingDraftEdit.value
                })
            })
        });
    }

    if (
        conversationAct.act === ACTS.EDIT_REQUEST &&
        conversationAct.editMode === "ask_target"
    ) {
        return returnDraftResult({
            sessionId,
            message,
            status: "editing_booking_draft",
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildBookingEditIntentReply(),
            booking: {
                status: "draft",
                draft: currentDraft,
                missingFields: currentMissingFields
            },
            draft: currentDraft,
            missingFields: currentMissingFields,
            extractedSlots: {},
            packageIntent: { type: "none", package: null },
            nextExpectedField: "editTarget",
            conversationAct: conversationActMeta
        });
    }

    if (
        conversationAct.act === ACTS.CANCEL_OR_ABORT &&
        conversationAct.cancelMode === "reject_pending"
    ) {
        await persistDraft(sessionId, currentDraft, currentMissingFields);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: currentMissingFields.length ? "collecting_info" : "ready_for_confirmation",
            bookingDraft: currentDraft,
            confirmedBookingId: null,
            lastBookingFailure: null,
            pendingDraftEdit: null,
            pendingDraftCancel: null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: currentMissingFields.length
                ? ACTIONS.ASK_BOOKING_INFO
                : ACTIONS.BOOKING_READY_TO_CONFIRM,
            reply: currentMissingFields.length
                ? await buildCollectingReplyWithAvailability(currentDraft, currentMissingFields)
                : buildReadyReply(currentDraft),
            booking: {
                status: currentMissingFields.length ? "draft" : "pending_confirmation",
                draft: currentDraft,
                missingFields: currentMissingFields
            },
            meta: buildBookingMeta({
                updatedSession,
                extractedSlots: {},
                packageIntent: { type: "none", package: null },
                missingFields: currentMissingFields,
                nextExpectedField: currentMissingFields[0] || null,
                conversationAct: conversationActMeta
            })
        });
    }

    if (
        conversationAct.act === ACTS.CANCEL_OR_ABORT &&
        conversationAct.requiresClarification
    ) {
        await persistDraft(sessionId, currentDraft, currentMissingFields);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: "booking_cancel_confirmation",
            bookingDraft: currentDraft,
            confirmedBookingId: null,
            lastBookingFailure: null,
            pendingDraftEdit: null,
            pendingDraftCancel: true
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: conversationAct.suggestedNextQuestion || "Bạn muốn hủy bản nháp hay tiếp tục đặt lịch?",
            booking: {
                status: currentMissingFields.length ? "draft" : "pending_confirmation",
                draft: currentDraft,
                missingFields: currentMissingFields
            },
            meta: buildBookingMeta({
                updatedSession,
                extractedSlots: {},
                packageIntent: { type: "none", package: null },
                missingFields: currentMissingFields,
                nextExpectedField: "cancelConfirmation",
                conversationAct: conversationActMeta
            })
        });
    }

    if (conversationAct.act === ACTS.CANCEL_OR_ABORT) {
        await persistDraft(sessionId, currentDraft, currentMissingFields);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: "booking_cancel_confirmation",
            bookingDraft: currentDraft,
            confirmedBookingId: null,
            lastBookingFailure: null,
            pendingDraftEdit: null,
            pendingDraftCancel: true
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildCancelDraftConfirmReply(),
            booking: {
                status: currentMissingFields.length ? "draft" : "pending_confirmation",
                draft: currentDraft,
                missingFields: currentMissingFields
            },
            meta: buildBookingMeta({
                updatedSession,
                extractedSlots: {},
                packageIntent: { type: "none", package: null },
                missingFields: currentMissingFields,
                nextExpectedField: "cancelConfirmation",
                conversationAct: conversationActMeta
            })
        });
    }

    if (conversationAct.act === ACTS.INFO_DETOUR) {
        const informationalDetour = await resolveBookingInformationalDetour(
            message,
            currentDraft
        );

        if (informationalDetour) {
            return returnDraftResult({
                sessionId,
                message,
                status: session.status || "collecting_info",
                action: ACTIONS.ASK_BOOKING_INFO,
                reply: buildInformationalDetourReply(
                    informationalDetour.packageItem,
                    currentDraft,
                    currentMissingFields,
                    { packageFromMessage: informationalDetour.packageFromMessage }
                ),
                booking: {
                    status: currentMissingFields.length ? "draft" : "pending_confirmation",
                    draft: currentDraft,
                    missingFields: currentMissingFields
                },
                draft: currentDraft,
                missingFields: currentMissingFields,
                extractedSlots: {},
                packageIntent: informationalDetour.packageIntent,
                nextExpectedField: currentMissingFields[0] || null,
                conversationAct: conversationActMeta
            });
        }
    }

    if (conversationAct.act === ACTS.AVAILABILITY_CHECK) {
        await persistDraft(sessionId, currentDraft, currentMissingFields);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: session.status || "collecting_info",
            bookingDraft: currentDraft,
            confirmedBookingId: null,
            lastBookingFailure: session.lastBookingFailure || null,
            pendingDraftEdit: session.pendingDraftEdit || null,
            pendingDraftCancel: session.pendingDraftCancel || null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: await buildAvailabilityCheckReply(currentDraft),
            booking: {
                status: currentMissingFields.length ? "draft" : "pending_confirmation",
                draft: currentDraft,
                missingFields: currentMissingFields
            },
            meta: buildBookingMeta({
                updatedSession,
                extractedSlots: {},
                packageIntent: { type: "none", package: null },
                missingFields: currentMissingFields,
                nextExpectedField: currentMissingFields[0] || null,
                conversationAct: conversationActMeta
            })
        });
    }

    if (
        conversationAct.act === ACTS.FINAL_CONFIRM &&
        !conversationAct.requiresClarification &&
        conversationAct.confidence >= 0.8 &&
        currentMissingFields.length === 0 &&
        !session.pendingDraftEdit &&
        !session.pendingDraftCancel &&
        session.status !== "booking_paused"
    ) {
        return createBookingFromDraft({
            sessionId,
            message,
            draft: {
                ...currentDraft,
                ...(sessionPhone ? { phoneNumber: sessionPhone } : {})
            },
            extractedSlots: {},
            packageIntent: currentDraft.selectedPackage
                ? { type: "selected", package: currentDraft.selectedPackage }
                : { type: "none", package: null },
            conversationAct: conversationActMeta
        });
    }

    if (conversationAct.act === ACTS.REVIEW_DRAFT) {
        await persistDraft(sessionId, currentDraft, currentMissingFields);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: session.status || "collecting_info",
            bookingDraft: currentDraft,
            confirmedBookingId: null,
            lastBookingFailure: session.lastBookingFailure || null,
            pendingDraftEdit: session.pendingDraftEdit || null,
            pendingDraftCancel: session.pendingDraftCancel || null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildReviewDraftReply(currentDraft, currentMissingFields),
            booking: {
                status: currentMissingFields.length ? "draft" : "pending_confirmation",
                draft: currentDraft,
                missingFields: currentMissingFields
            },
            meta: {
                ...buildBookingMeta({
                    updatedSession,
                    extractedSlots: {},
                    packageIntent: { type: "none", package: null },
                    missingFields: currentMissingFields,
                    nextExpectedField: currentMissingFields[0] || null
                }),
                conversationAct: conversationActMeta
            }
        });
    }

    if (conversationAct.act === ACTS.HELP_NEXT_STEP) {
        await persistDraft(sessionId, currentDraft, currentMissingFields);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: session.status || "collecting_info",
            bookingDraft: currentDraft,
            confirmedBookingId: null,
            lastBookingFailure: session.lastBookingFailure || null,
            pendingDraftEdit: session.pendingDraftEdit || null,
            pendingDraftCancel: session.pendingDraftCancel || null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildHelpNextStepReply(currentDraft, currentMissingFields),
            booking: {
                status: currentMissingFields.length ? "draft" : "pending_confirmation",
                draft: currentDraft,
                missingFields: currentMissingFields
            },
            meta: {
                ...buildBookingMeta({
                    updatedSession,
                    extractedSlots: {},
                    packageIntent: { type: "none", package: null },
                    missingFields: currentMissingFields,
                    nextExpectedField: currentMissingFields[0] || null
                }),
                conversationAct: conversationActMeta
            }
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
                nextExpectedField: "appointmentTime",
                conversationAct: conversationActMeta
            }
        });
    }

    if (
        !(
            session.lastBookingFailure &&
            resolveSuggestedSlotSelection(
                message,
                session.lastBookingFailure.suggestedSlots || []
            )
        ) &&
        (
            conversationAct.requiresClarification ||
            conversationAct.act === ACTS.UNCLEAR ||
            conversationAct.shouldMutateDraft === false
        )
    ) {
        await persistDraft(sessionId, currentDraft, currentMissingFields);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: session.status || "collecting_info",
            bookingDraft: currentDraft,
            confirmedBookingId: null,
            lastBookingFailure: session.lastBookingFailure || null,
            pendingDraftEdit: session.pendingDraftEdit || null,
            pendingDraftCancel: session.pendingDraftCancel || null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: currentMissingFields.length > 0 &&
                conversationAct.act === ACTS.FINAL_CONFIRM
                ? buildConfirmationOnlyBlockedReply(currentDraft, currentMissingFields)
                : currentMissingFields.length > 0 &&
                    conversationAct.act === ACTS.UNCLEAR
                    ? buildUnclearMissingFieldReply(currentMissingFields)
                    : conversationAct.suggestedNextQuestion || buildUnclearBookingDraftReply(),
            booking: {
                status: currentMissingFields.length ? "draft" : "pending_confirmation",
                draft: currentDraft,
                missingFields: currentMissingFields
            },
            meta: {
                ...buildBookingMeta({
                    updatedSession,
                    extractedSlots: {},
                    packageIntent: { type: "none", package: null },
                    missingFields: currentMissingFields,
                    nextExpectedField: currentMissingFields[0] || "clarifyBookingIntent"
                }),
                conversationAct: conversationActMeta
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

    if (
        conversationAct.act === ACTS.FIELD_VALUE &&
        currentMissingFields.length === 0 &&
        packageIntent.type === "none" &&
        Object.keys(extractedSlots).length === 0 &&
        !session.lastBookingFailure
    ) {
        await persistDraft(sessionId, currentDraft, []);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: session.status === "booking_paused" ? "booking_paused" : "ready_for_confirmation",
            bookingDraft: currentDraft,
            confirmedBookingId: null,
            lastBookingFailure: null,
            pendingDraftEdit: null,
            pendingDraftCancel: null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildUnclearBookingDraftReply(),
            booking: {
                status: "pending_confirmation",
                draft: currentDraft,
                missingFields: []
            },
            meta: buildBookingMeta({
                updatedSession,
                extractedSlots: {},
                packageIntent,
                missingFields: [],
                nextExpectedField: "clarifyBookingIntent",
                conversationAct: conversationActMeta
            })
        });
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
                rejectedPhone: extractedPhone,
                conversationAct: conversationActMeta
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
            reply: await buildCollectingReplyWithAvailability(nextDraft, missingFields),
            booking: {
                status: "draft",
                draft: nextDraft,
                missingFields
            },
            draft: nextDraft,
            missingFields,
            extractedSlots,
            packageIntent,
            nextExpectedField: "testType",
            conversationAct: conversationActMeta
        });
    }

    const appointmentDateChangedAfterTime = Boolean(
        extractedSlots.appointmentDate &&
            currentDraft.appointmentDate &&
            extractedSlots.appointmentDate !== currentDraft.appointmentDate &&
            currentDraft.appointmentTime &&
            !extractedSlots.appointmentTime
    );

    let nextDraft = {
        ...currentDraft,
        ...extractedSlots,
        ...(sessionPhone ? { phoneNumber: sessionPhone } : {})
    };

    if (appointmentDateChangedAfterTime) {
        nextDraft = {
            ...nextDraft,
            appointmentTime: null
        };
        extractedSlots.appointmentTime = null;
    }
    const missingFields = getMissingFields(nextDraft);

    const shouldRevalidateDraftTime = Boolean(
        nextDraft.appointmentDate &&
            nextDraft.appointmentTime &&
            (
                extractedSlots.appointmentDate ||
                extractedSlots.appointmentTime ||
                extractedSlots.testType ||
                extractedSlots.testCatalogItemId ||
                selectedSuggestedSlot
            )
    );

    if (shouldRevalidateDraftTime) {
        const isAvailable = await isSelectedTimeAvailable(
            nextDraft.appointmentDate,
            nextDraft.appointmentTime
        );

        if (!isAvailable) {
            const sameDaySlots = await getAvailableSlotsForDate(nextDraft.appointmentDate);
            const nearbySlots = sameDaySlots.length
                ? []
                : await getNearbyAvailableSlots(nextDraft.appointmentDate);
            const draftWithoutInvalidTime = {
                ...nextDraft,
                appointmentTime: null
            };
            const invalidTimeMissingFields = getMissingFields(draftWithoutInvalidTime);

            return returnDraftResult({
                sessionId,
                message,
                status: "collecting_info",
                action: ACTIONS.ASK_BOOKING_INFO,
                reply: buildUnavailableTimeReply({
                    requestedDate: nextDraft.appointmentDate,
                    requestedTime: nextDraft.appointmentTime,
                    sameDaySlots,
                    nearbySlots
                }),
                booking: {
                    status: "draft",
                    draft: draftWithoutInvalidTime,
                    missingFields: invalidTimeMissingFields
                },
                draft: draftWithoutInvalidTime,
                missingFields: invalidTimeMissingFields,
                extractedSlots: {
                    ...extractedSlots,
                    appointmentTime: null
                },
                packageIntent,
                nextExpectedField: "appointmentTime",
                conversationAct: withConversationActMeta(conversationActMeta, {
                    currentTurnBlockedReason: "unavailable_appointment_time"
                })
            });
        }
    }

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
                nextExpectedField: "address",
                conversationAct: conversationActMeta
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
            nextExpectedField: "address",
            conversationAct: conversationActMeta
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
            nextExpectedField: "address",
            conversationAct: conversationActMeta
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
            nextExpectedField: "address",
            conversationAct: conversationActMeta
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
                packageIntent,
                conversationAct: conversationActMeta
            });
        }
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
                    nextExpectedField: missingFields[0],
                    conversationAct: conversationActMeta
                });
            }

            if (
                appointmentDateChangedAfterTime &&
                missingFields[0] === "appointmentTime"
            ) {
                const sameDaySlots = (await findAvailableSlotsForDraftDate(nextDraft))
                    .filter((slot) => slot.date === nextDraft.appointmentDate);

                return returnDraftResult({
                    sessionId,
                    message,
                    status: "collecting_info",
                    action: ACTIONS.ASK_BOOKING_INFO,
                    reply: buildDateChangedSlotReply(nextDraft, sameDaySlots),
                    booking: {
                        status: "draft",
                        draft: nextDraft,
                        missingFields
                    },
                    draft: nextDraft,
                    missingFields,
                    extractedSlots,
                    packageIntent,
                    nextExpectedField: missingFields[0],
                    conversationAct: conversationActMeta
                });
            }

            return returnDraftResult({
                sessionId,
                message,
                status: "collecting_info",
                action: ACTIONS.ASK_BOOKING_INFO,
                reply: await buildCollectingReplyWithAvailability(nextDraft, missingFields),
                booking: {
                    status: "draft",
                    draft: nextDraft,
                    missingFields
                },
                draft: nextDraft,
                missingFields,
                extractedSlots,
                packageIntent,
                nextExpectedField: missingFields[0],
                conversationAct: conversationActMeta
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
                nextExpectedField: null,
                conversationAct: conversationActMeta
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
                nextExpectedField: "packageConfirmation",
                conversationAct: conversationActMeta
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
            nextExpectedField: missingFields[0] || null,
            conversationAct: conversationActMeta
        });
    }

    let status = "collecting_info";
    let action = ACTIONS.ASK_BOOKING_INFO;
    let reply = await buildCollectingReplyWithAvailability(nextDraft, missingFields);
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

    if (
        appointmentDateChangedAfterTime &&
        missingFields[0] === "appointmentTime"
    ) {
        const sameDaySlots = (await findAvailableSlotsForDraftDate(nextDraft))
            .filter((slot) => slot.date === nextDraft.appointmentDate);
        reply = buildDateChangedSlotReply(nextDraft, sameDaySlots);
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
        nextExpectedField: missingFields[0] || null,
        conversationAct: conversationActMeta
    });
}

module.exports = {
    handleBookingMessage,
    buildConversationActShadowMeta,
    buildConversationActShadowMetaAsync,
    hasActiveBookingSession,
    isIntentClassifierShadowAsyncEnabled,
    shouldHandleBookingFailureFollowup,
    suspendActiveBookingSession
};
