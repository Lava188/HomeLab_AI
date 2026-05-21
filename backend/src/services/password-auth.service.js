const bcrypt = require("bcryptjs");

const prisma = require("./booking-runtime/prisma-client");
const { normalizePhone } = require("./booking-runtime/booking-validation.service");

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_SALT_ROUNDS = 12;
const ADMIN_ROLES = ["ADMIN"];

function authError(code, message, statusCode = 400) {
    return {
        ok: false,
        statusCode,
        code,
        message
    };
}

function validatePassword(password) {
    return String(password || "");
}

function isStrongEnoughPassword(password) {
    return validatePassword(password).length >= PASSWORD_MIN_LENGTH;
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function isValidRegistrationPhone(phone) {
    return /^0\d{9}$/.test(normalizePhone(phone || ""));
}

async function hashPassword(password) {
    return bcrypt.hash(validatePassword(password), PASSWORD_SALT_ROUNDS);
}

async function comparePassword(password, passwordHash) {
    if (!passwordHash) return false;

    return bcrypt.compare(validatePassword(password), passwordHash);
}

function buildPhoneCandidates(phone) {
    const normalized = normalizePhone(phone || "");
    const candidates = new Set();

    if (normalized) {
        candidates.add(normalized);

        if (normalized.startsWith("84")) {
            candidates.add(`0${normalized.slice(2)}`);
            candidates.add(`+${normalized}`);
        }

        if (normalized.startsWith("0")) {
            candidates.add(`84${normalized.slice(1)}`);
            candidates.add(`+84${normalized.slice(1)}`);
        }
    }

    return Array.from(candidates);
}

async function findPatientByPhone(phone) {
    const candidates = buildPhoneCandidates(phone);
    if (candidates.length === 0) return null;

    return prisma.patient.findFirst({
        where: {
            phone: { in: candidates }
        }
    });
}

async function findStaffByPhone(phone) {
    const candidates = buildPhoneCandidates(phone);
    if (candidates.length === 0) return null;

    return prisma.staffProfile.findFirst({
        where: {
            phone: { in: candidates }
        }
    });
}

function userSession(patient) {
    return {
        role: "USER",
        patientId: patient.id,
        phone: patient.phone,
        name: patient.fullName
    };
}

function adminSession(staff) {
    return {
        role: "ADMIN",
        staffId: staff.id,
        phone: staff.phone,
        name: staff.fullName
    };
}

function collectorSession(staff) {
    return {
        role: "COLLECTOR",
        staffId: staff.id,
        phone: staff.phone,
        name: staff.fullName
    };
}

async function registerUser({ name, email, phone, password }) {
    const fullName = String(name || "").trim();
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone || "");

    if (!fullName) {
        return authError("USER_NAME_REQUIRED", "Vui lòng nhập họ tên.", 400);
    }

    if (!normalizedEmail) {
        return authError("USER_EMAIL_REQUIRED", "Vui lòng nhập email.", 400);
    }

    if (!isValidEmail(normalizedEmail)) {
        return authError("USER_EMAIL_INVALID", "Email không đúng định dạng.", 400);
    }

    if (!normalizedPhone) {
        return authError("USER_PHONE_REQUIRED", "Vui lòng nhập số điện thoại.", 400);
    }

    if (!isValidRegistrationPhone(normalizedPhone)) {
        return authError("USER_PHONE_INVALID", "Số điện thoại phải bắt đầu bằng 0 và có 10 chữ số.", 400);
    }

    if (!isStrongEnoughPassword(password)) {
        return authError("PASSWORD_TOO_WEAK", "Mật khẩu cần có ít nhất 8 ký tự.", 400);
    }

    const existingPatient = await findPatientByPhone(normalizedPhone);

    if (existingPatient) {
        return authError(
            "USER_ACCOUNT_ALREADY_EXISTS",
            "Số điện thoại này đã có tài khoản. Vui lòng đăng nhập.",
            409
        );
    }

    const patient = await prisma.patient.create({
        data: {
            fullName,
            email: normalizedEmail,
            phone: normalizedPhone,
            passwordHash: await hashPassword(password)
        }
    });

    return {
        ok: true,
        session: userSession(patient)
    };
}

async function loginUser({ phone, password }) {
    const patient = await findPatientByPhone(phone);

    if (!patient) {
        return authError(
            "USER_ACCOUNT_NOT_FOUND",
            "Không tìm thấy tài khoản người dùng với số điện thoại này.",
            404
        );
    }

    if (!patient.passwordHash) {
        return authError(
            "USER_PASSWORD_NOT_SET",
            "Tài khoản chưa thiết lập mật khẩu. Vui lòng đăng ký lại hoặc liên hệ hỗ trợ.",
            403
        );
    }

    const passwordMatches = await comparePassword(password, patient.passwordHash);

    if (!passwordMatches) {
        return authError("INVALID_CREDENTIALS", "Số điện thoại hoặc mật khẩu không đúng.", 401);
    }

    return {
        ok: true,
        session: userSession(patient)
    };
}

async function loginAdmin({ phone, password }) {
    const staff = await findStaffByPhone(phone);

    if (!staff || !ADMIN_ROLES.includes(staff.role)) {
        return authError("ADMIN_ACCOUNT_NOT_FOUND", "Không tìm thấy tài khoản quản trị phù hợp.", 404);
    }

    if (!staff.active) {
        return authError("STAFF_INACTIVE", "Tài khoản đã bị tạm khóa. Vui lòng liên hệ quản trị viên.", 403);
    }

    if (!staff.passwordHash) {
        return authError("STAFF_PASSWORD_NOT_SET", "Tài khoản nhân viên chưa thiết lập mật khẩu.", 403);
    }

    const passwordMatches = await comparePassword(password, staff.passwordHash);

    if (!passwordMatches) {
        return authError("INVALID_CREDENTIALS", "Số điện thoại hoặc mật khẩu không đúng.", 401);
    }

    return {
        ok: true,
        session: adminSession(staff)
    };
}

async function loginCollector({ phone, password }) {
    const staff = await findStaffByPhone(phone);

    if (!staff || staff.role !== "SAMPLE_COLLECTOR") {
        return authError("COLLECTOR_ACCOUNT_NOT_FOUND", "Không tìm thấy tài khoản nhân viên lấy mẫu phù hợp.", 404);
    }

    if (!staff.active) {
        return authError("STAFF_INACTIVE", "Tài khoản đã bị tạm khóa. Vui lòng liên hệ quản trị viên.", 403);
    }

    if (!staff.passwordHash) {
        return authError("STAFF_PASSWORD_NOT_SET", "Tài khoản nhân viên chưa thiết lập mật khẩu.", 403);
    }

    const passwordMatches = await comparePassword(password, staff.passwordHash);

    if (!passwordMatches) {
        return authError("INVALID_CREDENTIALS", "Số điện thoại hoặc mật khẩu không đúng.", 401);
    }

    return {
        ok: true,
        session: collectorSession(staff)
    };
}

module.exports = {
    PASSWORD_MIN_LENGTH,
    ADMIN_ROLES,
    buildPhoneCandidates,
    comparePassword,
    findPatientByPhone,
    findStaffByPhone,
    hashPassword,
    isValidEmail,
    isValidRegistrationPhone,
    isStrongEnoughPassword,
    loginAdmin,
    loginCollector,
    loginUser,
    normalizePhone,
    registerUser
};
