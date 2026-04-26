function getLeadSentence(text) {
    const cleanText = String(text || "").replace(/\s+/g, " ").trim();

    if (!cleanText) {
        return "";
    }

    const sentences = cleanText.split(/(?<=[.!?])\s+/);
    return sentences.slice(0, 2).join(" ").trim();
}

function dedupeTexts(items) {
    const seen = new Set();

    return items.filter((item) => {
        const normalized = String(item || "").trim();

        if (!normalized || seen.has(normalized)) {
            return false;
        }

        seen.add(normalized);
        return true;
    });
}

function buildInformationalReply(topChunks) {
    const primary = topChunks[0];
    const support = topChunks.find(
        (chunk, index) =>
            index > 0 &&
            chunk.source_id === primary.source_id &&
            chunk.chunk_id !== primary.chunk_id
    );

    return dedupeTexts([
        getLeadSentence(primary.content),
        support ? getLeadSentence(support.content) : "",
        "HomeLab chỉ hỗ trợ thông tin sức khỏe cơ bản và không thay thế tư vấn y tế trực tiếp."
    ]).join(" ");
}

function buildEmergencyReply(topChunks, urgencyLevel) {
    const primary = topChunks[0];
    const support = topChunks[1];
    const supportText =
        support && support.section === "red_flags"
            ? getLeadSentence(support.content)
            : "";

    const closing =
        urgencyLevel === "emergency"
            ? "Bạn nên đi cấp cứu hoặc đến cơ sở y tế khẩn cấp ngay, thay vì tự theo dõi tại nhà."
            : "Bạn nên được đánh giá y tế sớm và không nên tự chẩn đoán tại nhà.";

    return dedupeTexts([
        "Những thông tin phù hợp nhất hiện tại cho thấy đây là dấu hiệu đáng lo ngại.",
        getLeadSentence(primary.content),
        supportText,
        closing
    ]).join(" ");
}

function buildUrgentReply(topChunks) {
    const primary = topChunks[0];
    const support = topChunks.find(
        (chunk, index) =>
            index > 0 &&
            chunk.source_id === primary.source_id &&
            chunk.chunk_id !== primary.chunk_id
    );

    return dedupeTexts([
        getLeadSentence(primary.content),
        support ? getLeadSentence(support.content) : "",
        "Bạn nên đi khám sớm để được đánh giá phù hợp, thay vì tự theo dõi quá lâu tại nhà."
    ]).join(" ");
}

function buildTestAdviceReply(topChunks) {
    const primary = topChunks[0];
    const primaryInfo =
        primary && primary.section !== "red_flags"
            ? getLeadSentence(primary.content)
            : "";

    return dedupeTexts([
        primaryInfo,
        "Để gợi ý nhóm xét nghiệm phù hợp hơn, mình cần biết thêm mục tiêu kiểm tra, tuổi, giới tính, thời gian bạn bị mệt, bệnh nền hoặc thuốc đang dùng, và có kèm sốt, sụt cân, đau ngực, khó thở, chóng mặt hoặc ngất không.",
        "Nếu chỉ muốn kiểm tra tổng quát, bác sĩ thường cân nhắc theo bối cảnh các nhóm như công thức máu, đường huyết, chức năng gan thận, tuyến giáp, sắt/ferritin và nước tiểu; lựa chọn cụ thể còn phụ thuộc triệu chứng và tiền sử của bạn.",
        "HomeLab không dùng các xét nghiệm này để tự chẩn đoán bệnh. Nếu có đau ngực, khó thở, ngất, lả đi, sốt cao rét run hoặc tình trạng xấu đi nhanh, bạn nên đi khám khẩn cấp thay vì chỉ chọn gói xét nghiệm."
    ]).join(" ");
}

function buildMixedEmergencyReply(topChunks) {
    const sourceLabels = [...new Set(topChunks.map((chunk) => chunk.source_name || chunk.source_id))]
        .slice(0, 3)
        .join(", ");

    const lead =
        sourceLabels.length > 0
            ? `Các nguồn phù hợp nhất hiện tại (${sourceLabels}) đều đang nghiêng về nhiều nhóm cảnh báo nguy hiểm chồng lấp.`
            : "Các thông tin phù hợp nhất hiện tại cho thấy đây là tình huống có nhiều dấu hiệu cảnh báo nguy hiểm chồng lấp.";

    return [
        lead,
        "Bạn nên gọi cấp cứu hoặc đến cơ sở y tế khẩn cấp ngay, thay vì tự theo dõi tại nhà.",
        "HomeLab không dùng các tín hiệu này để tự chẩn đoán nguyên nhân cụ thể."
    ].join(" ");
}

function buildFallbackReply() {
    return (
        "Mình chưa đủ chắc chắn để trả lời an toàn dựa trên knowledge base hiện tại. " +
        "Bạn có thể mô tả rõ hơn tên xét nghiệm, triệu chứng, hoặc dấu hiệu đang lo ngại để mình tìm đúng thông tin hơn không?"
    );
}

function composeGroundedAnswer({ policyDecision, topChunks }) {
    if (!topChunks.length) {
        return buildFallbackReply();
    }

    if (policyDecision.primaryMode === "informational_test") {
        return buildInformationalReply(topChunks);
    }

    if (policyDecision.primaryMode === "emergency_or_urgent") {
        return buildEmergencyReply(topChunks, policyDecision.urgencyLevel);
    }

    if (policyDecision.primaryMode === "urgent_advice") {
        return buildUrgentReply(topChunks);
    }

    if (policyDecision.primaryMode === "test_advice") {
        return buildTestAdviceReply(topChunks);
    }

    if (policyDecision.primaryMode === "mixed_emergency") {
        return buildMixedEmergencyReply(topChunks);
    }

    return buildFallbackReply();
}

module.exports = {
    composeGroundedAnswer
};
