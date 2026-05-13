const { normalizeText } = require("../../utils/text.util");

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

function findBestLabExplanationChunk(topChunks, normalizedMessage) {
    if (normalizedMessage.includes("hba1c")) {
        const hba1cChunk = topChunks.find((chunk) => {
            const haystack = normalizeText(
                [
                    chunk.title,
                    chunk.content
                ].filter(Boolean).join(" ")
            );

            return haystack.includes("hba1c") || haystack.includes("a1c");
        }) || topChunks.find((chunk) => {
            const haystack = normalizeText(
                [
                    chunk.topic,
                    chunk.medical_scope,
                    chunk.intended_use
                ].filter(Boolean).join(" ")
            );

            return haystack.includes("hba1c") || haystack.includes("a1c");
        });

        if (hba1cChunk) {
            return hba1cChunk;
        }
    }

    return topChunks.find((chunk) => chunk.section !== "red_flags") || topChunks[0];
}

function buildLabExplanationReply(message, topChunks) {
    const normalizedMessage = normalizeText(message);
    const primary = findBestLabExplanationChunk(topChunks, normalizedMessage);
    const asksBloodDraw =
        normalizedMessage.includes("lay mau") ||
        normalizedMessage.includes("mau khong") ||
        normalizedMessage.includes("mau hay");
    const asksPreparation =
        normalizedMessage.includes("nhin an") ||
        normalizedMessage.includes("chuan bi") ||
        normalizedMessage.includes("truoc khi xet nghiem");

    if (normalizedMessage.includes("hba1c")) {
        let direct = "HbA1c, còn gọi là A1C, là xét nghiệm máu cho biết mức đường huyết trung bình trong khoảng hai đến ba tháng gần đây.";

        if (asksPreparation) {
            direct = "Riêng xét nghiệm HbA1c thường không cần nhịn ăn trước khi lấy máu.";
        } else if (asksBloodDraw) {
            direct = "Xét nghiệm HbA1c thường là xét nghiệm máu, nên cần lấy mẫu máu.";
        }

        return dedupeTexts([
            direct,
            asksPreparation
                ? "Tuy vậy, nếu bạn làm HbA1c cùng các xét nghiệm khác như đường huyết lúc đói hoặc mỡ máu, phòng xét nghiệm có thể yêu cầu nhịn ăn theo gói xét nghiệm đi kèm."
                : "",
            asksBloodDraw
                ? "Xét nghiệm này thường được dùng để đánh giá đường huyết trung bình trong thời gian gần đây, không phải để tự kết luận chẩn đoán chỉ từ một chỉ số."
                : "",
            "HomeLab chỉ giải thích ý nghĩa xét nghiệm ở mức thông tin chung, không chẩn đoán bệnh. Nếu bạn đã có kết quả cụ thể, nên đọc cùng bác sĩ hoặc nhân viên y tế trong bối cảnh triệu chứng và tiền sử của bạn."
        ]).join(" ");
    }

    return dedupeTexts([
        buildGenericLabExplanation(message, primary),
        "HomeLab chỉ giải thích ý nghĩa xét nghiệm ở mức thông tin chung, không chẩn đoán bệnh."
    ]).join(" ");
}

function buildGenericLabExplanation(message, primary) {
    const cleanQuestion = String(message || "")
        .replace(/[?!.]+$/g, "")
        .trim();
    const normalizedMessage = normalizeText(message);
    const target = cleanQuestion || "xét nghiệm bạn hỏi";

    if (
        normalizedMessage.includes("cbc") ||
        normalizedMessage.includes("cong thuc mau") ||
        normalizedMessage.includes("tong phan tich te bao mau") ||
        normalizedMessage.includes("tong phan tich mau")
    ) {
        return "CBC, hay tổng phân tích tế bào máu/công thức máu, là xét nghiệm đo các nhóm tế bào máu chính gồm hồng cầu, bạch cầu và tiểu cầu. Xét nghiệm này thường hỗ trợ đánh giá thiếu máu, nhiễm trùng hoặc viêm, và rối loạn số lượng tiểu cầu, nhưng không tự chẩn đoán bệnh chỉ từ một kết quả.";
    }

    if (
        normalizedMessage.includes("alt") ||
        normalizedMessage.includes("ast") ||
        normalizedMessage.includes("men gan")
    ) {
        return "ALT và AST là các men gan thường được dùng để đánh giá tình trạng tổn thương hoặc viêm tế bào gan, và đôi khi theo dõi bệnh gan hoặc tác động của thuốc. Kết quả cần đọc cùng triệu chứng, tiền sử, thuốc đang dùng và các xét nghiệm gan khác, không tự kết luận chẩn đoán chỉ từ ALT/AST.";
    }

    if (
        normalizedMessage.includes("creatinine") ||
        normalizedMessage.includes("creatinin") ||
        normalizedMessage.includes("egfr") ||
        normalizedMessage.includes("gfr")
    ) {
        return "Creatinine và eGFR là các chỉ số thường dùng để ước tính chức năng lọc của thận. Creatinine phản ánh một chất thải trong máu, còn eGFR ước tính mức lọc cầu thận; khi đọc kết quả cần xét thêm tuổi, giới, tiền sử bệnh, thuốc đang dùng và các chỉ số khác.";
    }

    if (
        normalizedMessage.includes("cholesterol") ||
        normalizedMessage.includes("triglyceride") ||
        normalizedMessage.includes("triglycerides") ||
        normalizedMessage.includes("mo mau")
    ) {
        return "Cholesterol và triglyceride đều thuộc nhóm mỡ máu nhưng phản ánh những phần khác nhau của chuyển hóa lipid. Cholesterol liên quan nhiều đến các thành phần như LDL, HDL và nguy cơ tim mạch, còn triglyceride thường chịu ảnh hưởng bởi năng lượng dư thừa, rượu, đường bột và một số bệnh lý chuyển hóa.";
    }

    return `Với câu hỏi "${target}", HomeLab có thể giải thích mục đích và ý nghĩa chung của xét nghiệm, nhưng không dùng thông tin này để chẩn đoán bệnh.`;
}

function buildMedicalReviewBoundaryReply(message) {
    const normalizedMessage = normalizeText(message);
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
            "Bạn nên đọc kết quả cùng bác sĩ hoặc nhân viên y tế, và có thể gửi các chỉ số cụ thể để HomeLab giải thích ý nghĩa chung từng chỉ số, không chẩn đoán."
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
        "Mình chưa thể kết luận bệnh chỉ từ một mô tả kết quả xét nghiệm.",
        "Kết quả cần được đọc cùng chỉ số cụ thể, khoảng tham chiếu của phòng xét nghiệm, triệu chứng, tiền sử và thuốc đang dùng.",
        "HomeLab có thể giải thích ý nghĩa chung từng chỉ số, nhưng không chẩn đoán chắc chắn."
    ].join(" ");
}

function isFeverConfusionRapidBreathing(message) {
    const normalizedMessage = normalizeText(message);

    return (
        normalizedMessage.includes("sot cao") &&
        (
            normalizedMessage.includes("lo mo") ||
            normalizedMessage.includes("lu lan")
        ) &&
        normalizedMessage.includes("tho nhanh")
    );
}

function isSevereBreathlessnessCyanosis(message) {
    const normalizedMessage = normalizeText(message);

    return (
        (
            normalizedMessage.includes("kho tho") ||
            normalizedMessage.includes("ngop tho")
        ) &&
        (
            normalizedMessage.includes("moi tim") ||
            normalizedMessage.includes("tim tai") ||
            normalizedMessage.includes("tim moi")
        )
    );
}

function buildEmergencyReply(message, topChunks, urgencyLevel) {
    if (isFeverConfusionRapidBreathing(message)) {
        return "Sốt cao kèm lơ mơ và thở nhanh là tình huống cần xử trí khẩn cấp. Bạn nên gọi cấp cứu hoặc đến cơ sở y tế khẩn cấp ngay, không chờ theo dõi tại nhà. Nếu có người ở cạnh, hãy nhờ họ hỗ trợ di chuyển an toàn và chuẩn bị thông tin thuốc, bệnh nền, thời điểm bắt đầu triệu chứng.";
    }

    if (isSevereBreathlessnessCyanosis(message)) {
        return "Khó thở kèm môi tím và rất mệt là dấu hiệu cấp cứu. Bạn nên gọi cấp cứu hoặc đến cơ sở y tế khẩn cấp ngay, không tự lái xe và không chờ đặt lịch xét nghiệm. Hãy ngồi tư thế dễ thở hơn trong lúc chờ hỗ trợ nếu có thể.";
    }

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

function composeGroundedAnswer({ message, policyDecision, topChunks }) {
    if (!topChunks.length) {
        return buildFallbackReply();
    }

    if (policyDecision.primaryMode === "informational_test") {
        return buildInformationalReply(topChunks);
    }

    if (policyDecision.primaryMode === "lab_explanation") {
        return buildLabExplanationReply(message, topChunks);
    }

    if (policyDecision.primaryMode === "medical_review_boundary") {
        return buildMedicalReviewBoundaryReply(message);
    }

    if (policyDecision.primaryMode === "emergency_or_urgent") {
        return buildEmergencyReply(message, topChunks, policyDecision.urgencyLevel);
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
