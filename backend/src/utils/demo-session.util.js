const { normalizePhone } = require("../services/booking-runtime/booking-validation.service");

function sanitizeHeaderValue(value = "") {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .replace(/[^\x20-\x7E]/g, "")
        .replace(/[^A-Za-z0-9._:-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 128);
}

function getDemoSessionFromRequest(req) {
    const role = sanitizeHeaderValue(req.get("x-demo-role") || "").toUpperCase();
    const phone = normalizePhone(req.get("x-demo-phone") || "");
    const userId = sanitizeHeaderValue(req.get("x-demo-user-id") || "");

    return {
        role,
        phone,
        userId
    };
}

function isAuthenticatedUserSession(session = {}) {
    return session.role === "USER" && Boolean(session.phone);
}

module.exports = {
    getDemoSessionFromRequest,
    isAuthenticatedUserSession,
    sanitizeHeaderValue
};
