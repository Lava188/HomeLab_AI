const prisma = require("./booking-runtime/prisma-client");
const { normalizeText } = require("../utils/text.util");

const REQUIRED_PACKAGES = [
    {
        code: "CBC",
        name: "Công thức máu",
        description:
            "Đánh giá các nhóm tế bào máu chính như hồng cầu, bạch cầu và tiểu cầu.",
        category: "Hematology",
        sampleType: "Blood",
        components: ["CBC"],
        suitableFor:
            "Kiểm tra thiếu máu, nhiễm trùng/viêm, theo dõi tổng quan tế bào máu.",
        preparationNotes: ["Không dùng để tự chẩn đoán bệnh."],
        keywords: ["cong thuc mau", "tong phan tich mau", "tong phan tich te bao mau", "cbc"]
    },
    {
        code: "HBA1C",
        name: "HbA1c",
        description:
            "Đánh giá đường huyết trung bình trong khoảng 2-3 tháng gần đây.",
        category: "Diabetes",
        sampleType: "Blood",
        components: ["HbA1c"],
        suitableFor: "Kiểm tra nguy cơ hoặc theo dõi đường huyết.",
        preparationNotes: ["Kết quả cần đọc cùng bác sĩ/nhân viên y tế."],
        keywords: ["hba1c", "hemoglobin a1c"]
    },
    {
        code: "LIPID_PROFILE",
        name: "Mỡ máu",
        description: "Đánh giá các chỉ số lipid máu thường dùng.",
        category: "Cardiometabolic",
        sampleType: "Blood",
        components: ["Cholesterol toàn phần", "LDL-C", "HDL-C", "Triglyceride"],
        suitableFor:
            "Đánh giá nguy cơ rối loạn lipid máu/tim mạch ở mức thông tin chung.",
        preparationNotes: ["Thực hiện theo hướng dẫn chuẩn bị của nhân viên y tế nếu có."],
        keywords: ["mo mau", "lipid", "cholesterol", "triglyceride", "triglycerides"]
    },
    {
        code: "LIVER_FUNCTION",
        name: "Chức năng gan",
        description: "Đánh giá một số chỉ số liên quan chức năng gan.",
        category: "Biochemistry",
        sampleType: "Blood",
        components: ["ALT", "AST", "Các chỉ số liên quan nếu có"],
        suitableFor:
            "Kiểm tra men gan/tổn thương tế bào gan ở mức sàng lọc.",
        preparationNotes: ["Kết quả cần đọc cùng bối cảnh sức khỏe và tư vấn y tế."],
        keywords: ["chuc nang gan", "men gan", "alt", "ast", "gan"]
    },
    {
        code: "KIDNEY_FUNCTION",
        name: "Chức năng thận",
        description: "Đánh giá chức năng lọc thận ở mức thông tin chung.",
        category: "Biochemistry",
        sampleType: "Blood",
        components: ["Creatinine", "eGFR"],
        suitableFor:
            "Đánh giá chức năng lọc thận ở mức thông tin chung.",
        preparationNotes: ["Kết quả cần đọc cùng bác sĩ/nhân viên y tế."],
        keywords: ["chuc nang than", "kiem tra than", "xet nghiem than", "creatinine", "creatinin", "egfr", "gfr"]
    },
    {
        code: "GENERAL_CHECKUP",
        name: "Gói tổng quát cơ bản",
        description: "Gói xét nghiệm hỗ trợ kiểm tra sức khỏe cơ bản.",
        category: "General",
        sampleType: "Blood",
        components: [
            "Công thức máu",
            "Đường huyết/HbA1c",
            "Mỡ máu",
            "Chức năng gan",
            "Chức năng thận"
        ],
        suitableFor: "Người muốn kiểm tra sức khỏe cơ bản.",
        preparationNotes: ["Không thay thế khám lâm sàng."],
        keywords: [
            "goi tong quat co ban",
            "goi tong quat",
            "xet nghiem tong quat",
            "kiem tra tong quat",
            "kiem tra suc khoe tong quat",
            "tong quat co ban"
        ]
    }
];

const AMBIGUOUS_TEST_SIGNALS = [
    "xet nghiem mau",
    "lay mau",
    "lay mau tai nha",
    "xet nghiem tai nha",
    "dat lich xet nghiem",
    "dat lich lay mau"
];

const PACKAGE_DETAIL_SIGNALS = [
    "gom nhung gi",
    "co nhung gi",
    "bao gom",
    "thanh phan",
    "mo ta",
    "phu hop",
    "can chuan bi",
    "luu y"
];

function getRequiredPackages() {
    return REQUIRED_PACKAGES.map((item) => ({ ...item }));
}

function summarizePackage(item) {
    if (!item) return null;

    return {
        id: item.id || null,
        code: item.code,
        name: item.name,
        description: item.description,
        category: item.category || null,
        sampleType: item.sampleType || null,
        components: item.components || [],
        suitableFor: item.suitableFor || null,
        preparationNotes: item.preparationNotes || []
    };
}

function getPackageByCode(code) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    return REQUIRED_PACKAGES.find((item) => item.code === normalizedCode) || null;
}

function getPackageByName(name) {
    const normalizedName = normalizeText(name);
    return (
        REQUIRED_PACKAGES.find((item) => normalizeText(item.name) === normalizedName) ||
        null
    );
}

function getCandidateSummaries() {
    return REQUIRED_PACKAGES.map((item) =>
        summarizePackage({
            ...item,
            id: null
        })
    );
}

async function attachDbIds(packages) {
    const codes = packages.map((item) => item.code);
    const dbItems = await prisma.testCatalogItem.findMany({
        where: {
            code: { in: codes },
            active: true
        }
    });
    const byCode = new Map(dbItems.map((item) => [item.code, item]));

    return packages.map((item) => ({
        ...item,
        id: byCode.get(item.code)?.id || item.id || null,
        description: byCode.get(item.code)?.description || item.description,
        category: byCode.get(item.code)?.category || item.category,
        sampleType: byCode.get(item.code)?.sampleType || item.sampleType
    }));
}

async function ensureRequiredCatalogItems() {
    const records = [];

    for (const item of REQUIRED_PACKAGES) {
        records.push(
            await prisma.testCatalogItem.upsert({
                where: { code: item.code },
                update: {
                    name: item.name,
                    description: item.description,
                    category: item.category,
                    sampleType: item.sampleType,
                    active: true
                },
                create: {
                    code: item.code,
                    name: item.name,
                    description: item.description,
                    category: item.category,
                    sampleType: item.sampleType,
                    active: true
                }
            })
        );
    }

    return records;
}

async function listCatalogPackages() {
    return attachDbIds(REQUIRED_PACKAGES);
}

async function getCatalogPackageByCode(code) {
    const item = getPackageByCode(code);
    if (!item) return null;

    const [withDbId] = await attachDbIds([item]);
    return withDbId || item;
}

function findStaticPackageInMessage(message) {
    const normalizedMessage = normalizeText(message);

    return (
        REQUIRED_PACKAGES.find((item) =>
            item.keywords.some((keyword) => normalizedMessage.includes(keyword))
        ) || null
    );
}

function isAmbiguousCatalogRequest(message) {
    const normalizedMessage = normalizeText(message);
    const matchedPackage = findStaticPackageInMessage(message);

    if (matchedPackage) return false;

    return AMBIGUOUS_TEST_SIGNALS.some((signal) =>
        normalizedMessage.includes(signal)
    );
}

function isPackageDetailQuestion(message) {
    const normalizedMessage = normalizeText(message);
    const matchedPackage = findStaticPackageInMessage(message);

    return Boolean(
        matchedPackage &&
            PACKAGE_DETAIL_SIGNALS.some((signal) => normalizedMessage.includes(signal))
    );
}

async function resolvePackageIntent(message) {
    if (isAmbiguousCatalogRequest(message)) {
        return {
            type: "ambiguous",
            package: null,
            candidates: getCandidateSummaries()
        };
    }

    const matchedPackage = findStaticPackageInMessage(message);

    if (!matchedPackage) {
        return {
            type: "none",
            package: null,
            candidates: []
        };
    }

    const [packageWithDbId] = await attachDbIds([matchedPackage]);

    return {
        type: isPackageDetailQuestion(message) ? "detail_question" : "selected",
        package: summarizePackage(packageWithDbId || matchedPackage),
        candidates: []
    };
}

function buildPackageListText() {
    return REQUIRED_PACKAGES.map((item) => item.name).join(", ");
}

function buildAmbiguousPackageReply() {
    return `Bạn muốn chọn gói xét nghiệm nào? HomeLab hiện có: ${buildPackageListText()}.`;
}

function buildPackageDetailReply(packageItem) {
    const item = summarizePackage(packageItem);

    if (!item) return buildAmbiguousPackageReply();

    const parts = [
        `${item.name}: ${item.description}`,
        `Thành phần: ${item.components.join(", ")}.`,
        `Phù hợp: ${item.suitableFor}.`
    ];

    if (item.preparationNotes.length > 0) {
        parts.push(`Lưu ý: ${item.preparationNotes.join(" ")}`);
    }

    return parts.join("\n");
}

function buildPackageConfirmationReply(packageItem) {
    const detail = buildPackageDetailReply(packageItem);
    return `${detail}\n\nBạn xác nhận chọn ${packageItem.name} để đặt lịch không?`;
}

module.exports = {
    getRequiredPackages,
    getPackageByCode,
    getPackageByName,
    getCandidateSummaries,
    ensureRequiredCatalogItems,
    listCatalogPackages,
    getCatalogPackageByCode,
    resolvePackageIntent,
    buildPackageListText,
    buildAmbiguousPackageReply,
    buildPackageDetailReply,
    buildPackageConfirmationReply
};
