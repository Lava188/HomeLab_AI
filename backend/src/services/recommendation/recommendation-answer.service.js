function composeRecommendationAnswer(recommendationDecision, fallbackReply) {
    if (!recommendationDecision || recommendationDecision.status === "disabled") {
        return fallbackReply;
    }

    if (
        recommendationDecision.status === "escalate" ||
        recommendationDecision.decisionType === "safety_escalation"
    ) {
        return [
            "Với các dấu hiệu bạn vừa nhắc tới, HomeLab ưu tiên an toàn trước việc chọn xét nghiệm.",
            "Nếu bạn đang đau ngực, khó thở, vã mồ hôi, ngất, lú lẫn hoặc tình trạng xấu đi nhanh, hãy liên hệ cấp cứu hoặc cơ sở y tế khẩn cấp ngay.",
            "HomeLab không dùng gói xét nghiệm để xử trí tình huống khẩn cấp."
        ].join(" ");
    }

    if (
        recommendationDecision.status === "ask_more" ||
        recommendationDecision.decisionType === "needs_more_context"
    ) {
        return composeAskMoreAnswer(recommendationDecision);
    }

    if (recommendationDecision.decisionType === "ready_but_catalog_disabled") {
        return composeReadyButNotLiveAnswer(recommendationDecision);
    }

    if (recommendationDecision.decisionType === "medical_review_boundary") {
        return composeMedicalReviewBoundaryAnswer(recommendationDecision);
    }

    if (
        recommendationDecision.status === "recommend" &&
        recommendationDecision.recommendedPackage
    ) {
        return composeLivePackageAnswer(recommendationDecision);
    }

    return [
        "HomeLab chưa đưa ra gợi ý xét nghiệm ở bước này.",
        "Bạn có thể mô tả thêm mục tiêu kiểm tra, triệu chứng chính, thời gian kéo dài và các dấu hiệu cần khám gấp nếu có."
    ].join(" ");
}

function composeMedicalReviewBoundaryAnswer(recommendationDecision) {
    const normalizedMessage =
        recommendationDecision.debug?.normalizedMessage || "";
    const hasBloodCancerConcern =
        normalizedMessage.includes("ung thu mau") ||
        normalizedMessage.includes("leukemia");
    const hasCbcOrWbcConcern =
        normalizedMessage.includes("cbc") ||
        normalizedMessage.includes("cong thuc mau") ||
        normalizedMessage.includes("bach cau");

    if (
        hasCbcOrWbcConcern &&
        hasBloodCancerConcern
    ) {
        return [
            "Mình chưa thể kết luận ung thư máu hay bệnh cụ thể chỉ từ câu mô tả CBC/bạch cầu bất thường.",
            "CBC bất thường có nhiều nguyên nhân như nhiễm trùng hoặc viêm, thiếu máu, mất nước, thuốc đang dùng, bệnh lý mạn tính hoặc rối loạn huyết học; cần xem dòng nào bất thường, mức độ lệch, khoảng tham chiếu và triệu chứng đi kèm.",
            "Bạn nên đọc kết quả cùng bác sĩ hoặc nhân viên y tế, và có thể gửi các chỉ số cụ thể để HomeLab giải thích ý nghĩa chung từng chỉ số, nhưng HomeLab sẽ không chẩn đoán chắc chắn."
        ].join(" ");
    }

    if (hasCbcOrWbcConcern) {
        return [
            "Bạch cầu cao hoặc CBC bất thường có thể gặp trong nhiều tình huống như nhiễm trùng, viêm, stress cơ thể, một số thuốc hoặc các bệnh lý khác.",
            "Chỉ từ thông tin này chưa đủ kết luận có nguy hiểm hay là bệnh cụ thể; cần xem mức tăng, loại bạch cầu tăng, các chỉ số CBC khác, triệu chứng và khoảng tham chiếu của phòng xét nghiệm.",
            "Bạn nên đọc kết quả cùng bác sĩ hoặc nhân viên y tế; HomeLab chỉ giải thích ý nghĩa chung và không chẩn đoán."
        ].join(" ");
    }

    if (
        normalizedMessage.includes("alt") ||
        normalizedMessage.includes("ast") ||
        normalizedMessage.includes("men gan")
    ) {
        return [
            "ALT/AST cao không tự động có nghĩa là bệnh gan nặng.",
            "Men gan có thể tăng vì nhiều lý do như viêm hoặc tổn thương tế bào gan, rượu, thuốc, gan nhiễm mỡ, vận động nặng hoặc bệnh lý khác; cần đọc cùng mức tăng cụ thể, triệu chứng và các xét nghiệm gan liên quan.",
            "Bạn nên trao đổi với bác sĩ hoặc nhân viên y tế để đánh giá nguyên nhân và mức độ, HomeLab không chẩn đoán bệnh chỉ từ ALT/AST."
        ].join(" ");
    }

    if (
        normalizedMessage.includes("creatinine") ||
        normalizedMessage.includes("creatinin") ||
        normalizedMessage.includes("egfr") ||
        normalizedMessage.includes("gfr") ||
        normalizedMessage.includes("suy than")
    ) {
        return [
            "Creatinine cao không đủ để tự kết luận suy thận.",
            "Chỉ số này cần đọc cùng eGFR, tuổi, giới, tình trạng mất nước, thuốc đang dùng, bệnh nền, nước tiểu và xu hướng qua nhiều lần xét nghiệm.",
            "Bạn nên đọc kết quả cùng bác sĩ hoặc nhân viên y tế, đặc biệt nếu có phù, tiểu ít, mệt nhiều, khó thở hoặc chỉ số tăng nhanh."
        ].join(" ");
    }

    return [
        "Mình chưa thể kết luận bệnh chỉ từ kết quả xét nghiệm.",
        "Kết quả cần được đọc cùng chỉ số cụ thể, khoảng tham chiếu của phòng xét nghiệm, triệu chứng, tiền sử, thuốc đang dùng và bối cảnh lâm sàng.",
        "Bạn có thể gửi các chỉ số cụ thể nếu muốn HomeLab giải thích ý nghĩa chung của từng chỉ số, nhưng HomeLab sẽ không chẩn đoán chắc chắn."
    ].join(" ");
}

function composeAskMoreAnswer(recommendationDecision) {
    const questions = buildNaturalQuestions(recommendationDecision).slice(0, 4);

    return [
        "Để tư vấn hướng xét nghiệm an toàn hơn, HomeLab cần thêm một vài thông tin:",
        ...questions.map((question) => `- ${question}`),
        "Nếu bạn đang đau ngực, khó thở, ngất/lú lẫn, sốt cao rét run hoặc tình trạng xấu đi nhanh, hãy ưu tiên liên hệ cơ sở y tế khẩn cấp."
    ].join("\n");
}

function composeLivePackageAnswer(recommendationDecision) {
    const packageItem = recommendationDecision.recommendedPackage;
    const packageName =
        packageItem.displayNameVi ||
        packageItem.displayName ||
        "gói xét nghiệm phù hợp";
    const includedTests = Array.isArray(packageItem.includedTests)
        ? packageItem.includedTests
        : [];
    const testsText = includedTests.length
        ? `Nhóm xét nghiệm chính: ${includedTests.join(", ")}.`
        : "HomeLab sẽ cần xác nhận thêm nhóm xét nghiệm chính với nhân viên y tế.";
    const reason = packageItem.reason || packageItem.rationale;

    return [
        `HomeLab có thể gợi ý ${packageName} để bạn trao đổi thêm với nhân viên y tế.`,
        testsText,
        reason ? `Lý do: ${reason}` : null,
        "Gợi ý này không phải chẩn đoán, không thay thế tư vấn y tế và không dùng để xử trí tình huống khẩn cấp.",
        "Nếu có đau ngực, khó thở, ngất/lú lẫn, vã mồ hôi hoặc tình trạng xấu đi nhanh, hãy ưu tiên liên hệ cơ sở y tế khẩn cấp."
    ]
        .filter(Boolean)
        .join(" ");
}

function buildNaturalQuestions(recommendationDecision) {
    const seen = new Set();
    const questions = [];

    for (const item of recommendationDecision.nextQuestions || []) {
        const question = naturalQuestionForSlot(item.slotId, item.question);
        if (question && !seen.has(question)) {
            seen.add(question);
            questions.push(question);
        }
    }

    if (!questions.length) {
        questions.push(
            "Bạn bao nhiêu tuổi và giới tính sinh học là gì?",
            "Bạn muốn kiểm tra tổng quát, thiếu máu/CBC, đường huyết/mỡ máu hay chức năng thận?",
            "Triệu chứng chính là gì và đã kéo dài bao lâu?",
            "Hiện có đau ngực, khó thở, ngất/lú lẫn, sốt cao rét run hoặc xấu đi nhanh không?"
        );
    }

    return questions;
}

function naturalQuestionForSlot(slotId, fallbackQuestion) {
    const questionsBySlot = {
        recommendation_goal:
            "Bạn muốn kiểm tra theo mục tiêu nào: tổng quát, thiếu máu/CBC, đường huyết/mỡ máu hay chức năng thận?",
        age: "Bạn bao nhiêu tuổi?",
        sex: "Giới tính sinh học của bạn là gì?",
        symptom_duration: "Triệu chứng chính đã kéo dài bao lâu?",
        symptom_summary:
            "Triệu chứng chính hoặc lý do muốn xét nghiệm của bạn là gì?",
        chest_pain_present: "Hiện tại bạn có đau ngực không?",
        shortness_of_breath_present: "Hiện tại bạn có khó thở không?",
        fainting_or_altered_consciousness_present:
            "Bạn có ngất, lú lẫn hoặc thay đổi ý thức không?",
        high_fever_or_rigors_present: "Bạn có sốt cao hoặc rét run không?"
    };

    return questionsBySlot[slotId] || cleanQuestion(fallbackQuestion);
}

function cleanQuestion(question) {
    const text = String(question || "").trim();
    if (!text || /[_:]/.test(text)) {
        return null;
    }

    return text;
}

function composeReadyButNotLiveAnswer(recommendationDecision) {
    const directions = getCandidateDirections(recommendationDecision);
    const directionText = directions.length
        ? `Các hướng có thể trao đổi thêm gồm ${joinVietnameseList(directions)}.`
        : "HomeLab có thể xác định một số hướng xét nghiệm để bạn trao đổi thêm với nhân viên y tế.";

    return [
        "Dựa trên thông tin hiện có, HomeLab có thể gợi ý hướng xét nghiệm phù hợp để bạn trao đổi thêm.",
        directionText,
        "Đây chỉ là định hướng trao đổi thêm, không phải xác nhận một gói xét nghiệm cụ thể và không thay thế tư vấn y tế."
    ].join(" ");
}

function getCandidateDirections(recommendationDecision) {
    const candidatePackages =
        recommendationDecision.packageDecision?.candidatePackages || [];
    const names = [];

    for (const packageItem of candidatePackages) {
        const tests = Array.isArray(packageItem?.includedTests)
            ? packageItem.includedTests
            : [];
        const normalizedTests = tests.map((test) => normalizeVietnamese(test));

        if (normalizedTests.some((test) => test.includes("cbc"))) {
            names.push("công thức máu/CBC");
        } else if (
            normalizedTests.some((test) =>
                test.includes("metabolic") ||
                test.includes("bmp") ||
                test.includes("chuyen hoa") ||
                test.includes("than")
            )
        ) {
            names.push("chức năng thận/chuyển hóa cơ bản");
        } else if (
            normalizedTests.some((test) =>
                test.includes("glucose") || test.includes("duong huyet")
            )
        ) {
            names.push("đường huyết");
        } else if (
            normalizedTests.some((test) =>
                test.includes("lipid") || test.includes("mo mau")
            )
        ) {
            names.push("mỡ máu");
        }
    }

    return [...new Set(names)].slice(0, 4);
}

function joinVietnameseList(items) {
    if (items.length <= 1) {
        return items[0] || "";
    }

    return `${items.slice(0, -1).join(", ")} và ${items[items.length - 1]}`;
}

function normalizeVietnamese(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase();
}

module.exports = {
    composeRecommendationAnswer
};
