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
        "HomeLab chi ho tro thong tin suc khoe co ban va khong thay the tu van y te truc tiep."
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
            ? "Ban nen di cap cuu hoac den co so y te khan cap ngay, thay vi tu theo doi tai nha."
            : "Ban nen duoc danh gia y te som va khong nen tu chan doan tai nha.";

    return dedupeTexts([
        "Nhung thong tin phu hop nhat hien tai cho thay day la dau hieu dang lo ngai.",
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
        "Ban nen di kham som de duoc danh gia phu hop, thay vi tu theo doi qua lau tai nha."
    ]).join(" ");
}

function buildMixedEmergencyReply(topChunks) {
    const sourceLabels = [...new Set(topChunks.map((chunk) => chunk.source_name || chunk.source_id))]
        .slice(0, 3)
        .join(", ");

    const lead =
        sourceLabels.length > 0
            ? `Cac nguon phu hop nhat hien tai (${sourceLabels}) deu dang nghieng ve nhieu nhom canh bao nguy hiem chong lap.`
            : "Cac thong tin phu hop nhat hien tai cho thay day la tinh huong co nhieu dau hieu canh bao nguy hiem chong lap.";

    return [
        lead,
        "Ban nen goi cap cuu hoac den co so y te khan cap ngay, thay vi tu theo doi tai nha.",
        "HomeLab khong dung cac tin hieu nay de tu chan doan nguyen nhan cu the."
    ].join(" ");
}

function buildFallbackReply() {
    return (
        "Minh chua du chac chan de tra loi an toan dua tren knowledge base hien tai. " +
        "Ban co the mo ta ro hon ten xet nghiem, trieu chung, hoac dau hieu dang lo ngai de minh tim dung thong tin hon khong?"
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

    if (policyDecision.primaryMode === "mixed_emergency") {
        return buildMixedEmergencyReply(topChunks);
    }

    return buildFallbackReply();
}

module.exports = {
    composeGroundedAnswer
};
