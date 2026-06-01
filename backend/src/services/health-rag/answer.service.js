const { normalizeText } = require("../../utils/text.util");
const {
    analyzeHealthConsultationContext,
    extractPreviousSymptoms,
    extractCurrentHealthDetails,
    isFollowUpQuestion,
    isFollowUpAnswer,
    isHealthFollowUpDetail,
    buildSessionSummary
} = require("./health-consultation-context.service");
const { analyzeHealthConsultationWithOllama, mergeSemanticWithContext } = require("./health-consultation-semantic.service");

function getLeadSentence(text) {
    const cleanText = String(text || "").replace(/\s+/g, " ").trim();

    if (!cleanText) {
        return "";
    }

    const sentences = cleanText.split(/(?<=[.!?])\s+/);
    return sentences.slice(0, 2).join(" ").trim();
}

function isLifestyleHealthAdviceQuery(normalizedMessage) {
    const lifestyleAdvicePatterns = [
        "ha huyet ap",
        "giam huyet ap",
        "kiem tra huyet ap",
        "huyet ap cao",
        "giam mo mau",
        "giam chi so mo mau",
        "mo mau cao",
        "giam duong huyet",
        "kiem tra duong huyet",
        "duong huyet cao",
        "tieu duong",
        "dai thao duong",
        "kiem soát tiểu đường",
        "kiem soat tieu duong",
        "giam can",
        "giu can",
        "kiem can",
        "sống khỏe",
        "sống khoe"
    ];

    return lifestyleAdvicePatterns.some((pattern) =>
        normalizedMessage.includes(pattern)
    );
}

function isLabResultSeverityQuery(normalizedMessage) {
    const labTerms = [
        "alt", "ast", "men gan",
        "creatinine", "creatinin", "egfr", "gfr",
        "cholesterol", "triglyceride", "mo mau",
        "cbc", "cong thuc mau", "bach cau"
    ];

    const hasLabTerm = labTerms.some((term) => normalizedMessage.includes(term));

    const hasSeverityIndicator = [
        "cao", "thap", "bat thuong", "tang", "giam"
    ].some((ind) => normalizedMessage.includes(ind));

    const hasSeverityQuestion = [
        "nghiem trọng",
        "nguy hiem",
        "nguy hiểm",
        "dang lo",
        "co",
        "khong",
        "an toan"
    ].some((q) => normalizedMessage.includes(q));

    const hasQuestionMark = normalizedMessage.includes("?") ||
                           normalizedMessage.includes(" co") ||
                           normalizedMessage.includes(" khong");

    return hasLabTerm && hasSeverityIndicator && (hasSeverityQuestion || hasQuestionMark);
}

function isReadOnlyConsultationSignal(normalizedMessage) {
    const readOnlySignals = [
        "chi hoi truoc",
        "hoi truoc",
        "chua muon dat",
        "chua muon đặt",
        "chua dat lich",
        "chưa đặt lịch",
        "chua muon kham",
        "chưa muốn khám",
        "chua muon xet nghiem",
        "chưa muốn xét nghiệm",
        "chi tu van",
        "chỉ tư vấn",
        "chi hoi thong tin",
        "chỉ hỏi thông tin",
        "tim hieu truoc",
        "tim hiểu trước"
    ];

    return readOnlySignals.some((signal) =>
        normalizedMessage.includes(signal)
    );
}

function buildLifestyleAdviceReply(message) {
    const normalizedMessage = normalizeText(message);
    let adviceParts = [];

    if (
        normalizedMessage.includes("huyet ap") ||
        normalizedMessage.includes("ha huyet ap")
    ) {
        adviceParts.push(
            "Để kiểm soát huyết áp: ăn giảm muối, hạn chế đồ ăn mặn và đồ chiên, duy trì cân nặng hợp lý, vận động 30 phút mỗi ngày, hạn chế rượu bia, quản lý stress và ngủ đủ giấc. Bạn nên theo dõi huyết áp tại nhà hoặc khám nếu chỉ số cao kéo dài."
        );
    }

    if (
        normalizedMessage.includes("mo mau") ||
        normalizedMessage.includes("giam chi so mo mau")
    ) {
        adviceParts.push(
            "Để cải thiện mỡ máu: hạn chế chất béo bão hòa (đồ chiên, mỡ động vật), tăng chất xơ (rau, quả, ngũ cốc), giảm đường và tinh bột tinh chế, vận động đều đặn, hạn chế rượu."
        );
    }

    if (
        normalizedMessage.includes("duong huyet") ||
        normalizedMessage.includes("tieu duong") ||
        normalizedMessage.includes("dai thao duong")
    ) {
        adviceParts.push(
            "Để kiểm soát đường huyết: kiểm soát cân nặng, ăn đều đặn và đúng giờ, hạn chế đồ ngọt và nước ngọt, vận động đều đặn, kiểm tra đường huyết định kỳ."
        );
    }

    const adviceText = adviceParts.length > 0
        ? adviceParts.join(" ")
        : "Để cải thiện sức khỏe, bạn có thể duy trì lối sống lành mạnh: ăn uống cân đối, vận động đều đặn, ngủ đủ giấc và quản lý stress.";

    return dedupeTexts([
        adviceText,
        "Nếu triệu chứng kéo dài hoặc bạn muốn theo dõi kỹ hơn, nên đi khám để được tư vấn gói kiểm tra phù hợp.",
        "Lưu ý: Lời khuyên này không thay thế tư vấn y tế trực tiếp và không dùng để chẩn đoán bệnh."
    ]).join(" ");
}

function buildLabResultSeverityReply(message, topChunks) {
    const normalizedMessage = normalizeText(message);
    let explanation = "";
    let followUpQuestion = "";

    if (normalizedMessage.includes("alt") || normalizedMessage.includes("ast")) {
        explanation = "ALT và AST là men gan, tăng cao có thể do tổn thương tế bào gan, rượu, thuốc, gan nhiễm mỡ hoặc bệnh lý khác.";
        followUpQuestion = "Mức ALT/AST của bạn bao nhiêu, có triệu chứng như vàng da, đau bụng phải, mệt nhiều hoặc đang dùng thuốc gì không?";
    }

    if (normalizedMessage.includes("creatinine") || normalizedMessage.includes("creatinin")) {
        explanation = "Creatinine cao có thể liên quan chức năng thận giảm, mất nước, thuốc hoặc bệnh lý khác, nhưng cần đọc cùng eGFR và triệu chứng.";
        followUpQuestion = "Creatinine của bạn bao nhiêu, có tiểu ít, phù chân, mệt nhiều hoặc bệnh thận/tiền sử bệnh gì không?";
    }

    if (normalizedMessage.includes("cholesterol") || normalizedMessage.includes("mo mau")) {
        explanation = "Mỡ máu cao là yếu tố nguy cơ tim mạch, cần xem LDL, HDL, triglyceride và bối cảnh tuổi, huyết áp, tiểu đường, hút thuốc.";
        followUpQuestion = "Chỉ số cụ thể của bạn bao nhiêu, có bệnh tiểu đường, huyết áp cao hoặc tiền sử gia đình tim mạch không?";
    }

    if (normalizedMessage.includes("cbc") || normalizedMessage.includes("bach cau")) {
        explanation = "Bạch cầu CBC thay đổi có thể do nhiễm trùng, viêm, stress, thuốc hoặc bệnh lý huyết học, cần xem dòng nào thay đổi và mức độ.";
        followUpQuestion = "Bạch cầu của bạn bao nhiêu, có sốt, nhiễm trùng, đang dùng thuốc hoặc có triệu chứng khác không?";
    }

    const genericExplanation = !explanation
        ? "Chỉ số xét nghiệm cao/thấp có thể do nhiều nguyên nhân, cần xem mức độ, khoảng tham chiếu phòng xét nghiệm, triệu chứng đi kèm và tiền sử."
        : "";

    const safetyNote = "Bạn nên đọc kết quả cùng bác sĩ/nhân viên y tế. Nếu có triệu chứng nặng như mệt nhiều, khó thở, đau ngực, vàng da, phù tiểu nhiều hoặc tình trạng xấu đi nhanh, nên đi khám sớm.";

    return dedupeTexts([
        explanation || genericExplanation,
        followUpQuestion,
        safetyNote,
        "HomeLab không chẩn đoán bệnh chỉ từ chỉ số xét nghiệm đơn lẻ."
    ]).filter(Boolean).join(" ");
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

function buildFallbackReply(message = "", sessionContext = {}) {
    const normalizedMessage = normalizeText(message);
    const previousSymptoms = extractPreviousSymptoms(sessionContext);
    const hasContext = previousSymptoms.length > 0;
    const isFollowUpAns = isFollowUpAnswer(normalizedMessage, previousSymptoms);

    if (hasContext && isFollowUpAns) {
        const symptomList = previousSymptoms.join(", ");
        return `Dựa trên triệu chứng bạn đã chia sẻ (${symptomList}) và thông tin bổ sung: "${message}", mình cần hỏi thêm một chút để tư vấn phù hợp hơn. Bạn có thể cho biết có kèm theo các dấu hiệu khác như sốt, sụt cân, đau ngực, khó thở, nôn mửa hoặc tình trạng xấu đi nhanh không?`;
    }

    if (hasContext) {
        const symptomList = previousSymptoms.join(", ");
        return `Dựa trên triệu chứng bạn đã chia sẻ (${symptomList}), bạn có thể cho biết thêm chi tiết như: bao lâu rồi, có kèm theo dấu hiệu khác không, hoặc đang lo vấn đề gì cụ thể?`;
    }

    return (
        "Mình chưa đủ chắc chắn để trả lời an toàn dựa trên knowledge base hiện tại. " +
        "Bạn có thể mô tả rõ hơn tên xét nghiệm, triệu chứng, hoặc dấu hiệu đang lo ngại để mình tìm đúng thông tin hơn không?"
    );
}

function buildClarifyingQuestionReply(message, context) {
    const semanticQuestions = context.semanticClarifyingQuestions || [];
    const questions = context.clarifyingQuestions || [];
    const normalizedMessage = normalizeText(message);
    const allQuestions = semanticQuestions.length > 0 ? semanticQuestions : questions;

    if (allQuestions.length === 0) {
        return "Mình cần thêm thông tin để gợi ý phù hợp hơn. Bạn có thể nói rõ hơn về triệu chứng, mục tiêu kiểm tra, hoặc độ tuổi không?";
    }

    if (normalizedMessage.includes("met") || normalizedMessage.includes("muc toi")) {
        return [
            "Mình cần thêm vài thông tin để gợi ý phù hợp hơn:",
            ...allQuestions.map((q, i) => `${i + 1}. ${q}`),
            "",
            "Sau khi bạn cung cấp thêm thông tin, mình có thể gợi ý hướng xét nghiệm phù hợp hơn.",
            "Lưu ý: nếu bạn có đau ngực, khó thở, ngất hoặc tình trạng xấu đi nhanh, nên đi khám khẩn cấp thay vì chỉ chọn xét nghiệm."
        ].join("\n");
    }

    if (normalizedMessage.includes("dau dau") || normalizedMessage.includes("dau bung")) {
        return [
            "Để gợi ý đúng hơn, mình cần thêm thông tin:",
            ...allQuestions.map((q, i) => `${i + 1}. ${q}`),
            "",
            "Nếu có đau ngực, khó thở, ngất hoặc tình trạng xấu đi nhanh, bạn nên đi khám khẩn cấp."
        ].join("\n");
    }

    return [
        "Mình cần thêm vài thông tin để gợi ý phù hợp hơn:",
        ...allQuestions.map((q, i) => `${i + 1}. ${q}`),
        "",
        "Nếu có đau ngực, khó thở, ngất hoặc tình trạng xấu đi nhanh, bạn nên đi khám khẩn cấp thay vì chỉ chọn xét nghiệm."
    ].join("\n");
}

function buildPackageGuidanceReply(message, context, topChunks) {
    const semanticHints = context.semanticSuggestedPackageHints || [];
    const hints = context.suggestedPackageHints || [];
    const combinedHints = semanticHints.length > 0 ? semanticHints : hints;
    const previousSymptoms = context.previousSymptoms || [];
    const normalizedMessage = normalizeText(message);
    const primary = topChunks[0];

    const packageDescriptions = {
        LIVER_FUNCTION: "Chức năng gan (ALT, AST): giúp kiểm tra men gan/tổn thương tế bào gan ở mức sàng lọc.",
        KIDNEY_FUNCTION: "Chức năng thận (Creatinine, eGFR): giúp đánh giá chức năng lọc thận ở mức thông tin chung.",
        GENERAL_CHECKUP: "Gói tổng quát cơ bản: bao gồm công thức máu, đường huyết, mỡ máu, chức năng gan và thận.",
        CBC: "Công thức máu: hỗ trợ đánh giá thiếu máu, nhiễm trùng/viêm ở mức cơ bản.",
        LIPID_PROFILE: "Mỡ máu: đánh giá cholesterol toàn phần, LDL-C, HDL-C, triglyceride."
    };

    if (combinedHints.length === 0) {
        const hasSymptomDescription = normalizedMessage.match(/met|chong mat|nhuc dau|dau bung|an uong kem|chan an|suc giam|khoe khong|kiem tra/);
        const hasPreviousSymptoms = previousSymptoms.length > 0;

        if (hasPreviousSymptoms || hasSymptomDescription) {
            const symptomText = hasPreviousSymptoms
                ? `Dựa trên triệu chứng bạn đã chia sẻ (${previousSymptoms.join(", ")}), `
                : "Dựa trên triệu chứng bạn mô tả, ";

            return [
                `${symptomText}nếu bạn muốn kiểm tra ban đầu, có thể cân nhắc gói tổng quát cơ bản.`,
                packageDescriptions.GENERAL_CHECKUP,
                "",
                "Trước khi chốt, mình cần biết: triệu chứng kéo dài bao lâu, có kèm sụt cân, sốt, đau ngực, khó thở hoặc nôn không?",
                "Lưu ý: đây chỉ là gợi ý tham khảo. Nếu triệu chứng kéo dài, nặng lên hoặc có dấu hiệu như đau ngực, khó thở, nên đi khám sớm."
            ].filter(Boolean).join(" ");
        }
        return "Dựa trên thông tin bạn cung cấp, bạn nên trao đổi với bác sĩ để được tư vấn xét nghiệm phù hợp hơn. HomeLab chỉ hỗ trợ thông tin cơ bản và không thay thế khám lâm sàng.";
    }

    if (combinedHints.includes("LIVER_FUNCTION")) {
        return [
            "Dựa trên thông tin bạn cung cấp, xét nghiệm liên quan đến men gan có thể phù hợp:",
            packageDescriptions.LIVER_FUNCTION,
            "",
            "Lưu ý:",
            "- Các chỉ số này cần đọc cùng triệu chứng, tiền sử rượu, thuốc đang dùng và bác sĩ/nhân viên y tế.",
            "- Không dùng riêng lẻ để chẩn đoán bệnh gan.",
            "- Nếu có vàng da, đau bụng phải dữ dội, nôn ra máu hoặc mê sảng, nên đi khám khẩn cấp.",
            primary ? getLeadSentence(primary.content) : ""
        ].filter(Boolean).join(" ");
    }

    if (combinedHints.includes("KIDNEY_FUNCTION")) {
        return [
            "Dựa trên thông tin bạn cung cấp, xét nghiệm chức năng thận có thể phù hợp:",
            packageDescriptions.KIDNEY_FUNCTION,
            "",
            "Lưu ý:",
            "- Creatinine và eGFR chỉ mang ý nghĩa tham khảo, cần đọc cùng triệu chứng, bệnh nền và bác sĩ.",
            "- Nếu có phù tiểu, tiểu ít, mệt nhiều hoặc khó thở, nên đi khám sớm.",
            primary ? getLeadSentence(primary.content) : ""
        ].filter(Boolean).join(" ");
    }

    if (combinedHints.includes("GENERAL_CHECKUP")) {
        return [
            "Dựa trên thông tin bạn cung cấp, gói tổng quát cơ bản có thể phù hợp:",
            packageDescriptions.GENERAL_CHECKUP,
            "",
            "Lưu ý:",
            "- Gói này hỗ trợ kiểm tra sức khỏe cơ bản, không thay thế khám lâm sàng.",
            "- Nếu có triệu chứng bất thường, nên trao đổi với bác sĩ.",
            "- Bạn có thể hỏi thêm chi tiết từng thành phần nếu muốn.",
            primary ? getLeadSentence(primary.content) : ""
        ].filter(Boolean).join(" ");
    }

    if (combinedHints.length >= 2) {
        const hintTexts = combinedHints
            .map((h) => packageDescriptions[h])
            .filter(Boolean)
            .map((d, i) => `${i + 1}. ${d}`);

        return [
            "Dựa trên thông tin bạn cung cấp, các xét nghiệm sau có thể phù hợp:",
            ...hintTexts,
            "",
            "Lưu ý: các xét nghiệm này chỉ mang ý nghĩa tham khảo và cần đọc cùng bác sĩ/nhân viên y tế. Nếu có triệu chứng bất thường, nên đi khám sớm.",
            primary ? getLeadSentence(primary.content) : ""
        ].filter(Boolean).join(" ");
    }

    return "Mình cần thêm thông tin để gợi ý phù hợp hơn. Bạn có thể nói rõ hơn về triệu chứng hoặc mục tiêu kiểm tra không?";
}

function buildContextAwareSymptomReply({ message, sessionContext }) {
    const previousSymptoms = extractPreviousSymptoms(sessionContext);
    const currentDetails = extractCurrentHealthDetails(message);
    const consultationState = sessionContext.healthConsultation || {};
    const followUpQuestion = isFollowUpQuestion(message, previousSymptoms);
    const followUpDetail = isHealthFollowUpDetail(message, sessionContext);

    if (!previousSymptoms.length) {
        return null;
    }

    if (currentDetails.redFlags.length > 0) {
        return null;
    }

    const symptomText = previousSymptoms.join(", ");
    const hasDuration = Boolean(currentDetails.duration);
    const severeWeakness = Boolean(currentDetails.severeWeakness);
    const pregnancyText = currentDetails.pregnancyNegative ? ", không mang thai" : "";
    const negativeFlags = [
        ...(Array.isArray(consultationState.negativeFlags) ? consultationState.negativeFlags : []),
        ...currentDetails.negativeFlags
    ];
    const hasMinimumSafetyInfo = negativeFlags.includes("no_chest_pain") &&
        negativeFlags.includes("no_breathlessness");

    if (followUpDetail) {
        const lines = [];

        lines.push(`Mình ghi nhận thêm: bạn đang có ${symptomText}${hasDuration ? ` khoảng ${currentDetails.duration}` : ""}${pregnancyText}${severeWeakness ? ", và đang yếu hơn nhiều" : ""}.`);

        if (severeWeakness) {
            lines.push(
                "Việc bạn thấy yếu hơn nhiều là thông tin cần chú ý. Bạn có đau ngực, khó thở, ngất hoặc lơ mơ, yếu liệt một bên, sốt cao, không tự đi lại được hay tình trạng xấu nhanh không? Nếu có, bạn nên đi khám sớm hoặc liên hệ cơ sở y tế ngay thay vì chỉ tự theo dõi tại nhà."
            );
            return lines.join("\n\n");
        }

        lines.push(
            "Để kiểm tra an toàn trước khi gợi ý xét nghiệm, bạn cho biết thêm: bạn có đau ngực, khó thở, ngất hoặc lơ mơ, yếu liệt một bên, sốt cao, không tự đi lại được hay tình trạng xấu nhanh không?"
        );

        return lines.join("\n\n");
    }

    if (followUpQuestion) {
        if (!hasMinimumSafetyInfo) {
            return [
                `Mình đang dựa trên các triệu chứng bạn đã chia sẻ: ${symptomText}.`,
                "Trước khi gợi ý gói hoặc xét nghiệm, bạn cho biết thêm: tình trạng kéo dài bao lâu, có đau ngực, khó thở, ngất hoặc lơ mơ, sốt cao hay xấu đi nhanh không?"
            ].join("\n\n");
        }

        return [
            `Dựa trên thông tin trước đó bạn đã nói là ${symptomText}, mình chưa nên chốt một nguyên nhân cụ thể.`,
            "Hướng kiểm tra ban đầu có thể cân nhắc: Công thức máu để tham khảo thiếu máu/nhiễm trùng; đường huyết hoặc HbA1c nếu cần đánh giá liên quan đường huyết; chức năng gan, chức năng thận; hoặc Gói tổng quát cơ bản nếu bạn muốn kiểm tra rộng hơn.",
            "Đây là gợi ý tham khảo, không phải chẩn đoán và cũng chưa phải chốt một gói duy nhất."
        ].join("\n\n");
    }

    return null;
}

function composeGroundedAnswer({ message, policyDecision, topChunks, sessionContext = {} }) {
    const standaloneDetails = extractCurrentHealthDetails(message);
    const previousSymptoms = extractPreviousSymptoms(sessionContext);

    if (
        !previousSymptoms.length &&
        standaloneDetails.duration &&
        !standaloneDetails.symptoms.length &&
        !standaloneDetails.redFlags.length
    ) {
        return "Mình ghi nhận thông tin bổ sung, nhưng chưa rõ bạn đang nói triệu chứng nào kéo dài hoặc thay đổi. Bạn cho biết triệu chứng cụ thể đang gặp là gì?";
    }

    const contextAwareReply = buildContextAwareSymptomReply({
        message,
        sessionContext
    });

    if (contextAwareReply) {
        return contextAwareReply;
    }

    if (!topChunks.length) {
        return buildFallbackReply(message, sessionContext);
    }

    const normalizedMessage = normalizeText(message);

    const isFollowUpWithSymptoms = previousSymptoms.length > 0 && (
        normalizedMessage.includes("vay") ||
        normalizedMessage.includes("vậy") ||
        normalizedMessage.includes("nên") ||
        (normalizedMessage.includes("chọn") && previousSymptoms.length > 0) ||
        (normalizedMessage.includes("xet nghiem") && previousSymptoms.length > 0)
    );

    const isFollowUpAns = isFollowUpAnswer(normalizedMessage, previousSymptoms);

    if (isReadOnlyConsultationSignal(normalizedMessage)) {
        const readOnlyReply = "Được, mình sẽ chỉ tư vấn thông tin, chưa tạo lịch. Bạn muốn hỏi về triệu chứng, chỉ số xét nghiệm hay chọn gói phù hợp?";
        const hasSymptom = sessionContext?.recentMessages?.some(m =>
            normalizeText(m.content || "").match(/met|chong mat|nhuc dau|dau bung|an uong kem|chan an/)
        );
        if (hasSymptom) {
            return readOnlyReply + " Dựa trên những gì bạn chia sẻ, mình có thể gợi ý hướng xét nghiệm tham khảo nếu bạn muốn.";
        }
        return readOnlyReply;
    }

    if (isLifestyleHealthAdviceQuery(normalizedMessage)) {
        return buildLifestyleAdviceReply(message);
    }

    if (isLabResultSeverityQuery(normalizedMessage)) {
        return buildLabResultSeverityReply(message, topChunks);
    }

    if (isFollowUpWithSymptoms) {
        return buildPackageGuidanceReply(message, { previousSymptoms, canSuggestPackages: true }, topChunks);
    }

    if (isFollowUpAns && previousSymptoms.length > 0) {
        const symptomList = previousSymptoms.join(", ");
        return [
            `Dựa trên triệu chứng ${symptomList} và thông tin bạn vừa bổ sung, mình ghi nhận:`,
            ...buildContextualFollowUpReply(normalizedMessage, previousSymptoms, topChunks),
            "",
            "Lưu ý: Đây chỉ là gợi ý tham khảo và không thay thế khám lâm sàng. Nếu có dấu hiệu như đau ngực, khó thở, ngất hoặc tình trạng xấu đi nhanh, bạn nên đi khám khẩn cấp."
        ].filter(Boolean).join(" ");
    }

    const consultationContext = analyzeHealthConsultationContext({
        message,
        sessionContext,
        retrievedChunks: topChunks
    });

    let semanticEnhancedContext = consultationContext;

    if (consultationContext.userGoal !== "urgent_health" &&
        consultationContext.userGoal !== "test_explanation" &&
        !consultationContext.needsUrgentCare) {

        try {
            const semanticResult = analyzeHealthConsultationWithOllama({
                message,
                sessionContext,
                currentContext: consultationContext,
                retrievedChunks: topChunks
            }, { fetchImpl: null });

            if (semanticResult && !semanticResult.fallbackReason && semanticResult.shouldUseSemantic) {
                semanticEnhancedContext = mergeSemanticWithContext(consultationContext, semanticResult);
            }
        } catch {
        }
    }

    if (semanticEnhancedContext.needsUrgentCare) {
        if (policyDecision.primaryMode === "mixed_emergency") {
            return buildMixedEmergencyReply(topChunks);
        }
        return buildEmergencyReply(message, topChunks, policyDecision.urgencyLevel || "emergency");
    }

    if (semanticEnhancedContext.userGoal === "test_explanation") {
        return buildLabExplanationReply(message, topChunks);
    }

    if (semanticEnhancedContext.isFollowUp && semanticEnhancedContext.previousSymptoms.length > 0) {
        return buildPackageGuidanceReply(message, semanticEnhancedContext, topChunks);
    }

    if (semanticEnhancedContext.shouldAskClarifyingQuestion) {
        if (policyDecision.primaryMode === "lab_explanation") {
            return buildLabExplanationReply(message, topChunks);
        }
        if (policyDecision.primaryMode === "medical_review_boundary") {
            return buildMedicalReviewBoundaryReply(message);
        }
        return buildClarifyingQuestionReply(message, semanticEnhancedContext);
    }

    if (semanticEnhancedContext.canSuggestPackages) {
        if (policyDecision.primaryMode === "medical_review_boundary") {
            return buildMedicalReviewBoundaryReply(message);
        }
        return buildPackageGuidanceReply(message, semanticEnhancedContext, topChunks);
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

    return buildFallbackReply(message, sessionContext);
}

module.exports = {
    composeGroundedAnswer
};
