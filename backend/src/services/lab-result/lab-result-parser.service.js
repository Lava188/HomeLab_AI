const MARKER = "__RANGE__";

const ANALYTES = [
    {
        code: "WBC",
        nameVi: "Bạch cầu",
        group: "CBC",
        aliases: ["WBC", "White blood cells", "Leukocytes", "Bach cau", "Bạch cầu"]
    },
    {
        code: "RBC",
        nameVi: "Hồng cầu",
        group: "CBC",
        aliases: ["RBC", "Red blood cells", "Erythrocytes", "Hong cau", "Hồng cầu"]
    },
    {
        code: "HGB",
        nameVi: "Hemoglobin",
        group: "CBC",
        aliases: ["HGB", "Hb", "Hemoglobin", "Huyet sac to", "Huyết sắc tố"]
    },
    {
        code: "HCT",
        nameVi: "Hematocrit",
        group: "CBC",
        aliases: ["HCT", "Hematocrit", "Dung tich hong cau", "Dung tích hồng cầu"]
    },
    {
        code: "PLT",
        nameVi: "Tiểu cầu",
        group: "CBC",
        aliases: ["PLT", "Platelets", "Tieu cau", "Tiểu cầu"]
    },
    {
        code: "NEUT",
        nameVi: "Bạch cầu trung tính",
        group: "CBC",
        aliases: ["NEUT", "Neutrophils", "Neutrophil", "Trung tinh", "Bạch cầu trung tính"]
    },
    {
        code: "LYMPH",
        nameVi: "Bạch cầu lympho",
        group: "CBC",
        aliases: ["LYMPH", "Lymphocytes", "Lymphocyte", "Lympho", "Bạch cầu lympho"]
    },
    {
        code: "ALT",
        nameVi: "Men gan ALT",
        group: "Liver",
        aliases: ["ALT", "SGPT", "Alanine aminotransferase"]
    },
    {
        code: "AST",
        nameVi: "Men gan AST",
        group: "Liver",
        aliases: ["AST", "SGOT", "Aspartate aminotransferase"]
    },
    {
        code: "GGT",
        nameVi: "Men gan GGT",
        group: "Liver",
        aliases: ["GGT", "Gamma GT", "Gamma-glutamyl transferase"]
    },
    {
        code: "ALP",
        nameVi: "Phosphatase kiềm",
        group: "Liver",
        aliases: ["ALP", "Alkaline phosphatase", "Phosphatase kiem", "Phosphatase kiềm"]
    },
    {
        code: "BILIRUBIN",
        nameVi: "Bilirubin",
        group: "Liver",
        aliases: ["Bilirubin", "Bilirubin total", "Total bilirubin"]
    },
    {
        code: "CREATININE",
        nameVi: "Creatinine",
        group: "Kidney",
        aliases: ["Creatinine", "Creatinin"]
    },
    {
        code: "UREA",
        nameVi: "Urea",
        group: "Kidney",
        aliases: ["Urea", "BUN", "Blood urea nitrogen"]
    },
    {
        code: "EGFR",
        nameVi: "eGFR",
        group: "Kidney",
        aliases: ["eGFR", "GFR", "Estimated GFR"]
    },
    {
        code: "GLUCOSE",
        nameVi: "Glucose",
        group: "Glucose",
        aliases: ["Glucose", "Glu", "Duong huyet", "Đường huyết"]
    },
    {
        code: "HBA1C",
        nameVi: "HbA1c",
        group: "Glucose",
        aliases: ["HbA1c", "A1c", "Hemoglobin A1c"]
    },
    {
        code: "CHOLESTEROL",
        nameVi: "Cholesterol toàn phần",
        group: "Lipid",
        aliases: ["Cholesterol", "Total cholesterol", "Cholesterol toàn phần"]
    },
    {
        code: "TRIGLYCERIDE",
        nameVi: "Triglyceride",
        group: "Lipid",
        aliases: ["Triglyceride", "Triglycerides", "TG"]
    },
    {
        code: "HDL-C",
        nameVi: "HDL-C",
        group: "Lipid",
        aliases: ["HDL-C", "HDL C", "HDL cholesterol", "HDL"]
    },
    {
        code: "LDL-C",
        nameVi: "LDL-C",
        group: "Lipid",
        aliases: ["LDL-C", "LDL C", "LDL cholesterol", "LDL"]
    }
];

const RANGE_PATTERN = /(?:(?:tham\s*chieu|tham\s*chiếu|reference(?:\s*range)?|ref\.?|normal(?:\s*range)?|khoang\s*tham\s*chieu|khoảng\s*tham\s*chiếu)\s*[:=]?\s*)?([<>]=?\s*)?(-?\d+(?:[.,]\d+)?)\s*(?:-|–|—|to|den|đến)\s*(-?\d+(?:[.,]\d+)?)/i;
const SINGLE_BOUND_PATTERN = /(?:(?:tham\s*chieu|tham\s*chiếu|reference(?:\s*range)?|ref\.?|normal(?:\s*range)?|khoang\s*tham\s*chieu|khoảng\s*tham\s*chiếu)\s*[:=]?\s*)?([<>]=?)\s*(-?\d+(?:[.,]\d+)?)/i;

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeNumber(raw) {
    if (!raw) {
        return null;
    }

    const normalized = raw.replace(",", ".");
    const value = Number(normalized);

    return Number.isFinite(value) ? value : null;
}

function normalizeLine(line) {
    return String(line || "")
        .replace(/\t/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function lineLooksLikeHeader(line) {
    return /^(test|xet nghiem|xét nghiệm|result|ket qua|kết quả|unit|don vi|đơn vị|reference|tham chiếu)/i.test(line);
}

function lineLooksLikeSampleMetadata(line) {
    return /(tg\s*lấy\s*mẫu|tg\s*lay\s*mau|thời\s*gian\s*lấy\s*mẫu|thoi\s*gian\s*lay\s*mau|giờ\s*lấy\s*mẫu|gio\s*lay\s*mau|người\s*lấy\s*mẫu|nguoi\s*lay\s*mau)/i.test(line);
}

function buildAliasPattern(analyte) {
    const aliases = analyte.aliases
        .slice()
        .sort((a, b) => b.length - a.length)
        .map(escapeRegex);

    return new RegExp(`(?:^|[^A-Za-z0-9])(${aliases.join("|")})(?=$|[^A-Za-z0-9])`, "i");
}

function extractValueAndUnit(afterAlias) {
    const valueMatch = afterAlias.match(/[:=]?\s*(?:result|ket qua|kết quả)?\s*[:=]?\s*([<>]?\s*-?\d+(?:[.,]\d+)?)/i);

    if (!valueMatch) {
        return null;
    }

    const value = normalizeNumber(valueMatch[1].replace(/[<>]/g, "").trim());
    if (value === null) {
        return null;
    }

    const afterValue = afterAlias.slice(valueMatch.index + valueMatch[0].length);
    const beforeRange = afterValue.replace(RANGE_PATTERN, MARKER).replace(SINGLE_BOUND_PATTERN, MARKER);
    const unitMatch = beforeRange.match(/^\s*([A-Za-z%/µμ.\d^]+(?:\s*\/\s*[A-Za-z0-9.^]+)?)/);
    let unit = unitMatch ? unitMatch[1].trim() : "";

    if (/^(ref|reference|normal|tham|khoang|khoảng)$/i.test(unit)) {
        unit = "";
    }

    return {
        value,
        unit,
        afterValue
    };
}

function extractReference(afterValue) {
    const rangeMatch = afterValue.match(RANGE_PATTERN);

    if (rangeMatch) {
        return {
            referenceRangeRaw: rangeMatch[0].trim(),
            referenceLow: normalizeNumber(rangeMatch[2]),
            referenceHigh: normalizeNumber(rangeMatch[3])
        };
    }

    const singleBoundMatch = afterValue.match(SINGLE_BOUND_PATTERN);

    if (singleBoundMatch) {
        const operator = singleBoundMatch[1];
        const bound = normalizeNumber(singleBoundMatch[2]);

        return {
            referenceRangeRaw: singleBoundMatch[0].trim(),
            referenceLow: operator.includes(">") ? bound : null,
            referenceHigh: operator.includes("<") ? bound : null
        };
    }

    return {
        referenceRangeRaw: "",
        referenceLow: null,
        referenceHigh: null
    };
}

function isShortTriglycerideAliasAllowed(line, alias, valueAndUnit, reference) {
    if (alias.toUpperCase() !== "TG") {
        return true;
    }

    const hasLipidContext = /(triglycerid|triglyceride|mỡ\s*máu|mo\s*mau)/i.test(line);
    const hasLipidUnit = /^(mmol\/l|mg\/dl)$/i.test(valueAndUnit.unit.replace(/\s+/g, ""));
    const hasReference = reference.referenceLow !== null || reference.referenceHigh !== null;

    return hasLipidContext || (hasLipidUnit && hasReference);
}

function classify(value, referenceLow, referenceHigh) {
    if (referenceLow === null && referenceHigh === null) {
        return {
            flag: "UNKNOWN",
            severity: "UNKNOWN"
        };
    }

    if (referenceLow !== null && value < referenceLow) {
        const diffRatio = referenceLow === 0 ? 1 : (referenceLow - value) / Math.abs(referenceLow);
        return {
            flag: "LOW",
            severity: diffRatio <= 0.05 ? "MILD_LOW" : diffRatio <= 0.2 ? "MODERATE_LOW" : "MARKED_LOW"
        };
    }

    if (referenceHigh !== null && value > referenceHigh) {
        const diffRatio = referenceHigh === 0 ? 1 : (value - referenceHigh) / Math.abs(referenceHigh);
        return {
            flag: "HIGH",
            severity: diffRatio <= 0.1 ? "MILD_HIGH" : diffRatio <= 0.5 ? "MODERATE_HIGH" : "MARKED_HIGH"
        };
    }

    return {
        flag: "NORMAL",
        severity: "NORMAL"
    };
}

function confidenceFor(match, hasReference, unit) {
    if (hasReference && unit) {
        return "HIGH";
    }

    if (hasReference || match[1].length <= 5) {
        return "MEDIUM";
    }

    return "LOW";
}

function parseLabResultsFromText(text) {
    const lines = String(text || "")
        .split(/\r?\n/)
        .map(normalizeLine)
        .filter(Boolean)
        .filter((line) => !lineLooksLikeHeader(line));
    const parsedByCode = new Map();

    for (const line of lines) {
        for (const analyte of ANALYTES) {
            if (parsedByCode.has(analyte.code)) {
                continue;
            }

            const aliasPattern = buildAliasPattern(analyte);
            const match = aliasPattern.exec(line);

            if (!match) {
                continue;
            }

            const aliasStart = match.index + match[0].indexOf(match[1]);
            const aliasEnd = aliasStart + match[1].length;

            if (
                analyte.code === "TRIGLYCERIDE" &&
                lineLooksLikeSampleMetadata(line)
            ) {
                continue;
            }

            if (
                analyte.code === "HGB" &&
                /^a1c\b/i.test(line.slice(aliasEnd))
            ) {
                continue;
            }

            if (
                analyte.code === "CHOLESTEROL" &&
                /\b(HDL|LDL)\s*-?\s*C?\s*$/i.test(line.slice(0, aliasStart))
            ) {
                continue;
            }

            const afterAlias = line.slice(match.index + match[0].length);
            const valueAndUnit = extractValueAndUnit(afterAlias);

            if (!valueAndUnit) {
                continue;
            }

            const reference = extractReference(valueAndUnit.afterValue);
            if (
                analyte.code === "TRIGLYCERIDE" &&
                !isShortTriglycerideAliasAllowed(line, match[1], valueAndUnit, reference)
            ) {
                continue;
            }

            const classification = classify(
                valueAndUnit.value,
                reference.referenceLow,
                reference.referenceHigh
            );
            const hasReference = reference.referenceLow !== null || reference.referenceHigh !== null;

            parsedByCode.set(analyte.code, {
                code: analyte.code,
                nameVi: analyte.nameVi,
                group: analyte.group,
                value: valueAndUnit.value,
                unit: valueAndUnit.unit,
                referenceRangeRaw: reference.referenceRangeRaw,
                referenceLow: reference.referenceLow,
                referenceHigh: reference.referenceHigh,
                flag: classification.flag,
                severity: classification.severity,
                evidenceText: line.slice(0, 280),
                parseConfidence: confidenceFor(match, hasReference, valueAndUnit.unit)
            });
        }
    }

    return Array.from(parsedByCode.values());
}

module.exports = {
    parseLabResultsFromText,
    ANALYTES
};
