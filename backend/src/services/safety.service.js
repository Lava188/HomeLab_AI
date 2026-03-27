const { FLOWS, ACTIONS } = require("../constants/chat.constants");
const { normalizeText } = require("../utils/text.util");

function findMatchedKeywords(text, keywords) {
    return keywords.filter((keyword) => text.includes(keyword));
}

function checkSafety({ message }) {
    const normalizedMessage = normalizeText(message);

    const emergencyKeywords = [
        "kho tho",
        "khong tho duoc",
        "tuc nguc",
        "dau nguc du doi",
        "dau nguc",
        "ngat",
        "xiu",
        "co giat",
        "bat tinh",
        "chay mau nhieu",
        "sot cao lien tuc",
        "sot cao khong ha",
        "kho noi",
        "liet",
        "te nua nguoi",
        "me man",
        "tim tai nan",
        "tu tu",
        "tu sat"
    ];

    const matchedEmergencyKeywords = findMatchedKeywords(
        normalizedMessage,
        emergencyKeywords
    );

    if (matchedEmergencyKeywords.length > 0) {
        return {
            isSafe: false,
            flow: FLOWS.EMERGENCY,
            action: ACTIONS.SHOW_EMERGENCY_WARNING,
            reply:
                "HomeLab chỉ hỗ trợ tư vấn sức khỏe cơ bản và đặt lịch xét nghiệm tại nhà, không thay thế cấp cứu. Với dấu hiệu bạn mô tả, bạn nên liên hệ cơ sở y tế gần nhất hoặc gọi cấp cứu ngay.",
            meta: {
                checkedBy: "safety.service",
                reason: "emergency_red_flag",
                matchedKeywords: matchedEmergencyKeywords
            }
        };
    }

    return {
        isSafe: true,
        flow: null,
        action: null,
        reply: null,
        meta: {
            checkedBy: "safety.service",
            reason: "no_emergency_red_flag",
            matchedKeywords: []
        }
    };
}

module.exports = {
    checkSafety
};