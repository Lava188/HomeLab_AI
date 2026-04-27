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
        return [
            "Mình chưa thể kết luận bệnh chỉ từ kết quả xét nghiệm.",
            "Kết quả CBC cần được bác sĩ hoặc nhân viên y tế đọc cùng triệu chứng, tiền sử, thuốc đang dùng và khoảng tham chiếu của phòng xét nghiệm.",
            "Bạn có thể gửi các chỉ số cụ thể nếu muốn HomeLab giải thích ý nghĩa chung của từng chỉ số, nhưng HomeLab sẽ không chẩn đoán chắc chắn."
        ].join(" ");
    }

    if (
        recommendationDecision.status === "recommend" &&
        recommendationDecision.recommendedPackage
    ) {
        const packageName =
            recommendationDecision.recommendedPackage.displayNameVi ||
            recommendationDecision.recommendedPackage.displayName ||
            "gói xét nghiệm phù hợp";

        return [
            `Dựa trên thông tin hiện có, HomeLab có thể gợi ý ${packageName} để bạn trao đổi thêm với nhân viên y tế.`,
            "Gợi ý này không thay thế tư vấn y tế và không dùng để chẩn đoán bệnh."
        ].join(" ");
    }

    return [
        "HomeLab chưa đưa ra gợi ý xét nghiệm ở bước này.",
        "Bạn có thể mô tả thêm mục tiêu kiểm tra, triệu chứng chính, thời gian kéo dài và các dấu hiệu cần khám gấp nếu có."
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

        if (tests.some((test) => String(test).toLowerCase().includes("cbc"))) {
            names.push("công thức máu/CBC");
        } else if (
            tests.some((test) => String(test).toLowerCase().includes("metabolic"))
        ) {
            names.push("chức năng thận/chuyển hóa cơ bản");
        } else if (
            tests.some((test) => String(test).toLowerCase().includes("glucose"))
        ) {
            names.push("đường huyết");
        } else if (
            tests.some((test) => String(test).toLowerCase().includes("lipid"))
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

module.exports = {
    composeRecommendationAnswer
};
