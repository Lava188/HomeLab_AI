const DISCLAIMER =
    "HomeLab chỉ giải thích ý nghĩa xét nghiệm ở mức thông tin chung, không chẩn đoán bệnh và không thay thế bác sĩ.";

const GROUP_NAMES = {
    CBC: "Công thức máu",
    Liver: "Gan mật",
    Kidney: "Thận",
    Glucose: "Đường huyết",
    Lipid: "Mỡ máu"
};

const ITEM_MEANINGS = {
    WBC: "WBC phản ánh số lượng bạch cầu trong máu và thường được đọc cùng công thức bạch cầu.",
    RBC: "RBC phản ánh số lượng hồng cầu, cần đọc cùng HGB và HCT.",
    HGB: "HGB là lượng hemoglobin, liên quan khả năng vận chuyển oxy của máu.",
    HCT: "HCT là tỷ lệ thể tích hồng cầu trong máu, thường đọc cùng RBC và HGB.",
    PLT: "PLT là số lượng tiểu cầu, liên quan quá trình đông cầm máu.",
    NEUT: "NEUT là nhóm bạch cầu trung tính, nên đọc cùng WBC và các dòng bạch cầu khác.",
    LYMPH: "LYMPH là nhóm bạch cầu lympho, nên đọc cùng WBC và NEUT.",
    ALT: "ALT là men gan, thường được đọc cùng AST, GGT, ALP và bilirubin.",
    AST: "AST là men gan, thường được đọc cùng ALT và các chỉ số gan mật khác.",
    GGT: "GGT là men liên quan gan mật, thường đọc cùng ALT, AST, ALP và bilirubin.",
    ALP: "ALP là phosphatase kiềm, thường đọc cùng GGT và bilirubin.",
    BILIRUBIN: "Bilirubin phản ánh sắc tố mật, thường đọc cùng men gan và bối cảnh lâm sàng.",
    CREATININE: "Creatinine là chỉ số thường dùng để theo dõi chức năng lọc của thận, nên đọc cùng eGFR và urea.",
    UREA: "Urea phản ánh sản phẩm chuyển hóa đạm, nên đọc cùng creatinine, eGFR và tình trạng nước trong cơ thể.",
    EGFR: "eGFR là ước tính mức lọc cầu thận, cần đọc cùng creatinine, tuổi và bối cảnh cá nhân.",
    GLUCOSE: "Glucose phản ánh đường huyết tại thời điểm xét nghiệm, cần biết tình trạng nhịn ăn hoặc sau ăn.",
    HBA1C: "HbA1c phản ánh đường huyết trung bình trong khoảng vài tháng gần đây.",
    CHOLESTEROL: "Cholesterol toàn phần là một phần của bộ mỡ máu, cần đọc cùng HDL-C, LDL-C và triglyceride.",
    TRIGLYCERIDE: "Triglyceride là một thành phần mỡ máu, chịu ảnh hưởng bởi bữa ăn, chuyển hóa và thuốc.",
    "HDL-C": "HDL-C là một thành phần mỡ máu thường được đọc cùng LDL-C, triglyceride và cholesterol toàn phần.",
    "LDL-C": "LDL-C là một thành phần mỡ máu thường được đọc cùng HDL-C, triglyceride và yếu tố nguy cơ cá nhân."
};

function describeReference(item) {
    if (item.referenceLow !== null && item.referenceHigh !== null) {
        return `${item.referenceLow} - ${item.referenceHigh}${item.unit ? ` ${item.unit}` : ""}`;
    }

    if (item.referenceLow !== null) {
        return `>= ${item.referenceLow}${item.unit ? ` ${item.unit}` : ""}`;
    }

    if (item.referenceHigh !== null) {
        return `<= ${item.referenceHigh}${item.unit ? ` ${item.unit}` : ""}`;
    }

    return null;
}

function describeDeviation(item) {
    if (item.flag === "LOW" && item.referenceLow !== null) {
        return `thấp hơn ngưỡng dưới ${Number((item.referenceLow - item.value).toFixed(3))}${item.unit ? ` ${item.unit}` : ""}`;
    }

    if (item.flag === "HIGH" && item.referenceHigh !== null) {
        return `cao hơn ngưỡng trên ${Number((item.value - item.referenceHigh).toFixed(3))}${item.unit ? ` ${item.unit}` : ""}`;
    }

    if (item.flag === "NORMAL") {
        return "nằm trong khoảng tham chiếu đọc được từ phiếu";
    }

    return "chưa đánh giá được mức lệch vì HomeLab chưa đọc được khoảng tham chiếu từ phiếu";
}

function statusVi(flag) {
    return {
        LOW: "thấp",
        NORMAL: "bình thường",
        HIGH: "cao",
        UNKNOWN: "chưa xác định"
    }[flag] || "chưa xác định";
}

function buildItemInterpretation(item) {
    const referenceText = describeReference(item);
    const valueText = `${item.value}${item.unit ? ` ${item.unit}` : ""}`;

    return {
        code: item.code,
        nameVi: item.nameVi,
        group: item.group,
        flag: item.flag,
        severity: item.severity,
        summaryVi:
            item.flag === "UNKNOWN"
                ? `${item.nameVi}: kết quả ${valueText}. HomeLab chưa đọc được khoảng tham chiếu từ phiếu, nên chưa đánh giá cao/thấp cho chỉ số này.`
                : `${item.nameVi}: kết quả ${valueText}, ${statusVi(item.flag)} so với khoảng tham chiếu ${referenceText}.`,
        whatItIsVi: ITEM_MEANINGS[item.code] || `${item.nameVi} là một chỉ số xét nghiệm cần đọc trong bối cảnh phiếu xét nghiệm đầy đủ.`,
        comparisonVi:
            item.flag === "UNKNOWN"
                ? "Chưa có khoảng tham chiếu đọc được từ PDF, vì vậy không kết luận chỉ số cao hay thấp."
                : `So với khoảng tham chiếu ${referenceText}, kết quả hiện ${statusVi(item.flag)} và ${describeDeviation(item)}.`,
        generalMeaningVi:
            item.flag === "NORMAL"
                ? "Khi nằm trong khoảng tham chiếu, chỉ số này thường không gợi ý bất thường riêng lẻ trên phiếu."
                : item.flag === "UNKNOWN"
                  ? "Cần đối chiếu lại phiếu gốc hoặc khoảng tham chiếu của phòng xét nghiệm để diễn giải chính xác hơn."
                  : "Khi nằm ngoài khoảng tham chiếu, chỉ số này nên được xem lại cùng triệu chứng, tiền sử, thuốc đang dùng và các xét nghiệm liên quan.",
        readWithContextVi: "Không nên đọc chỉ số này đơn lẻ; cần kết hợp tuổi, giới, thời điểm lấy mẫu, thuốc đang dùng, triệu chứng và các chỉ số cùng nhóm.",
        nonDiagnosisNoteVi: "Nhận xét này không phải chẩn đoán và không đưa ra kết luận bệnh lý cụ thể.",
        evidenceText: item.evidenceText
    };
}

function buildOverview(parsedItems) {
    if (parsedItems.length === 0) {
        return "HomeLab chưa parse được chỉ số xét nghiệm phổ biến nào từ PDF. Người dùng nên kiểm tra chất lượng file hoặc nhập lại chỉ số chính.";
    }

    const abnormal = parsedItems.filter((item) => item.flag === "LOW" || item.flag === "HIGH");
    const unknown = parsedItems.filter((item) => item.flag === "UNKNOWN");

    if (abnormal.length > 0) {
        return `HomeLab đọc được ${parsedItems.length} chỉ số, trong đó ${abnormal.length} chỉ số nằm ngoài khoảng tham chiếu đọc được từ phiếu. Các nhận xét dưới đây chỉ mang tính thông tin chung.`;
    }

    if (unknown.length > 0) {
        return `HomeLab đọc được ${parsedItems.length} chỉ số, nhưng ${unknown.length} chỉ số chưa có khoảng tham chiếu đọc được nên chưa thể phân loại cao/thấp.`;
    }

    return `HomeLab đọc được ${parsedItems.length} chỉ số và các chỉ số này nằm trong khoảng tham chiếu đọc được từ phiếu.`;
}

function buildConclusion(parsedItems, counts) {
    const unknownNote =
        counts.unknownCount > 0
            ? " Một số chỉ số chưa đánh giá được vì HomeLab chưa đọc được khoảng tham chiếu từ PDF."
            : "";

    if (counts.totalParsed === 0) {
        return "HomeLab chưa nhận diện được chỉ số xét nghiệm có cấu trúc từ file này. Bạn nên kiểm tra lại chất lượng PDF hoặc nhập lại các chỉ số chính.";
    }

    if (counts.abnormalCount === 0 && counts.normalCount > 0) {
        return `Các chỉ số HomeLab đọc được hiện nằm trong khoảng tham chiếu trên phiếu. Chưa thấy chỉ số nào ngoài khoảng tham chiếu trong nhóm đã nhận diện. Tuy nhiên, kết quả này chỉ phản ánh các chỉ số đọc được từ PDF và không thay thế đánh giá của bác sĩ.${unknownNote}`;
    }

    if (counts.abnormalCount > 0) {
        const abnormalItems = parsedItems
            .filter((item) => item.flag === "LOW" || item.flag === "HIGH")
            .map((item) => {
                const direction =
                    item.flag === "HIGH"
                        ? "cao hơn khoảng tham chiếu"
                        : "thấp hơn khoảng tham chiếu";

                return `${item.code}/${item.nameVi} ${direction}`;
            })
            .join(", ");

        return `HomeLab nhận thấy một số chỉ số đang ngoài khoảng tham chiếu trên phiếu: ${abnormalItems}. Đây là các điểm cần chú ý, nhưng chưa đủ để kết luận bệnh cụ thể. Bạn nên trao đổi với bác sĩ hoặc nhân viên y tế để đọc kết quả trong bối cảnh triệu chứng, tiền sử và thuốc đang dùng.${unknownNote}`;
    }

    return `HomeLab đã đọc được ${counts.totalParsed} chỉ số từ PDF.${unknownNote}`;
}

function buildGroupSummaries(parsedItems) {
    const groups = new Map();

    for (const item of parsedItems) {
        const current = groups.get(item.group) || {
            group: item.group,
            groupNameVi: GROUP_NAMES[item.group] || item.group,
            total: 0,
            abnormalCount: 0,
            normalCount: 0,
            unknownCount: 0,
            highlightsVi: []
        };

        current.total += 1;
        if (item.flag === "LOW" || item.flag === "HIGH") {
            current.abnormalCount += 1;
            current.highlightsVi.push(`${item.code} ${statusVi(item.flag)} (${item.value}${item.unit ? ` ${item.unit}` : ""})`);
        } else if (item.flag === "NORMAL") {
            current.normalCount += 1;
        } else {
            current.unknownCount += 1;
        }

        groups.set(item.group, current);
    }

    return Array.from(groups.values()).map((group) => ({
        ...group,
        summaryVi:
            group.abnormalCount > 0
                ? `${group.groupNameVi}: có ${group.abnormalCount}/${group.total} chỉ số ngoài khoảng tham chiếu đọc được.`
                : group.unknownCount > 0
                  ? `${group.groupNameVi}: có ${group.unknownCount}/${group.total} chỉ số chưa đọc được khoảng tham chiếu.`
                  : `${group.groupNameVi}: các chỉ số parse được nằm trong khoảng tham chiếu đọc được.`
    }));
}

function textHasUrgentSignal(text) {
    return /(đau ngực|dau nguc|khó thở|kho tho|ngất|ngat|co giật|co giat|chảy máu nhiều|chay mau nhieu|cấp cứu|cap cuu|emergency)/i.test(
        text || ""
    );
}

function buildProfessionalSummary(parsedItems, sourceText) {
    const abnormalCount = parsedItems.filter((item) => item.flag === "LOW" || item.flag === "HIGH").length;
    const normalCount = parsedItems.filter((item) => item.flag === "NORMAL").length;
    const unknownCount = parsedItems.filter((item) => item.flag === "UNKNOWN").length;
    const counts = {
        totalParsed: parsedItems.length,
        abnormalCount,
        normalCount,
        unknownCount
    };
    const safetyNotes = [DISCLAIMER];

    if (abnormalCount > 0) {
        safetyNotes.push("Có chỉ số ngoài khoảng tham chiếu đọc được; người dùng nên trao đổi với bác sĩ hoặc nhân viên y tế để được diễn giải theo bối cảnh cá nhân.");
    }

    if (textHasUrgentSignal(sourceText)) {
        safetyNotes.push("Nếu người dùng đang có triệu chứng cấp cứu như đau ngực, khó thở, ngất, co giật hoặc chảy máu nhiều, hãy đi cấp cứu ngay.");
    }

    return {
        totalParsed: parsedItems.length,
        abnormalCount,
        normalCount,
        unknownCount,
        overviewVi: buildOverview(parsedItems),
        conclusionVi: buildConclusion(parsedItems, counts),
        groupSummaries: buildGroupSummaries(parsedItems),
        itemInterpretations: parsedItems.map(buildItemInterpretation),
        safetyNotes,
        limitations: [
            "PDF có thể bị lỗi OCR, mất dòng hoặc lệch cột; HomeLab chỉ dùng phần text trích xuất được.",
            "Khoảng tham chiếu có thể thay đổi theo phòng xét nghiệm, tuổi, giới, phương pháp đo và đơn vị.",
            "Nếu không đọc được khoảng tham chiếu từ phiếu, HomeLab không tự đặt ngưỡng để kết luận cao/thấp.",
            "Kết quả cần được đối chiếu với phiếu gốc và bối cảnh lâm sàng bởi nhân viên y tế."
        ]
    };
}

module.exports = {
    buildProfessionalSummary,
    DISCLAIMER
};
