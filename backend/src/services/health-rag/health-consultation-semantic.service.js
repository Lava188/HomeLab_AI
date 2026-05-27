const { normalizeText } = require("../../utils/text.util");

const PROVIDER_NAME = "ollama_shadow_health_consultation";
const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "qwen2.5:3b";
const DEFAULT_TIMEOUT_MS = 60000;

const SEMANTIC_VERSION = "health_consultation_semantic_v5n2";

const USER_GOAL_TYPES = [
    "symptom_advice",
    "test_advice",
    "test_explanation",
    "lifestyle_health_guidance",
    "lab_result_severity",
    "read_only_consultation",
    "package_recommendation_ready",
    "urgent_health",
    "unclear_health_request"
];

function getConfig(env = process.env) {
    return {
        baseUrl: String(env.HOMELAB_OLLAMA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
        model: env.HOMELAB_INTENT_CLASSIFIER_MODEL || DEFAULT_MODEL,
        timeoutMs: Number(env.HOMELAB_INTENT_CLASSIFIER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
    };
}

function isModelMissing(status, text) {
    const normalized = String(text || "").toLowerCase();
    return (
        status === 404 ||
        (normalized.includes("model") &&
            (normalized.includes("not found") ||
                normalized.includes("not installed") ||
                normalized.includes("pull")))
    );
}

function isConnectionError(error) {
    const code = error?.cause?.code || error?.code || "";
    const message = String(error?.message || "").toLowerCase();

    return (
        code === "ECONNREFUSED" ||
        code === "ECONNRESET" ||
        code === "ENOTFOUND" ||
        message.includes("fetch failed") ||
        message.includes("connection refused")
    );
}

async function readResponseText(response) {
    try {
        return await response.text();
    } catch {
        return "";
    }
}

function stripJsonFence(rawText) {
    const text = String(rawText || "").trim();
    const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenceMatch ? fenceMatch[1].trim() : text;
}

function buildHealthConsultationPrompt(input = {}) {
    const { message, sessionContext, currentContext, retrievedChunks, packageCatalog } = input;

    const recentMessages = Array.isArray(sessionContext?.recentMessages)
        ? sessionContext.recentMessages.slice(-5).map((m) => ({
              role: m.role || "user",
              content: m.content || ""
          }))
        : [];

    const conversationHistory = recentMessages.length > 0
        ? recentMessages.map((m) => `${m.role}: ${m.content}`).join("\n")
        : "(không có lịch sử hội thoại)";

    const contextSummary = currentContext?.summary || "(không có tóm tắt bối cảnh)";
    const missingInfo = Array.isArray(currentContext?.missingInfo)
        ? currentContext.missingInfo.join(", ")
        : "";

    const packageHints = Array.isArray(packageCatalog)
        ? packageCatalog.map((p) => `${p.code}: ${p.name}`).join("; ")
        : "CBC: Công thức máu; LIVER_FUNCTION: Chức năng gan; KIDNEY_FUNCTION: Chức năng thận; GENERAL_CHECKUP: Gói tổng quát cơ bản";

    return [
        "Bạn là trợ lý tư vấn sức khỏe read-only cho HomeLab.",
        "CHỈ TRẢ VỀ JSON, không có markdown, không có giải thích bên ngoài JSON.",
        "",
        "NGUYÊN TẮC AN TOÀN (BẮT BUỘC):",
        "- KHÔNG chẩn đoán bệnh.",
        "- KHÔNG khẳng định nguyên nhân.",
        "- KHÔNG kê đơn thuốc.",
        "- KHÔNG tự quyết định tạo booking.",
        "- KHÔNG tự xác nhận booking.",
        "- Nếu có dấu hiệu nguy hiểm, chỉ đánh dấu needsUrgentCare=true, thêm vào safetyNotes.",
        "- Nếu thiếu thông tin, hỏi thêm 1-3 câu.",
        "- Nếu đủ thông tin an toàn, có thể gợi ý hướng xét nghiệm/gói từ catalog.",
        "",
        "TASK: Phân tích câu hỏi tư vấn sức khỏe và trả về JSON với schema sau:",
        JSON.stringify({
            version: SEMANTIC_VERSION,
            provider: PROVIDER_NAME,
            userGoal: "symptom_advice | test_advice | test_explanation | lifestyle_health_guidance | lab_result_severity | read_only_consultation | package_recommendation_ready | urgent_health | unclear_health_request",
            summary: "string, tóm tắt bối cảnh sức khỏe hiện tại trong phiên chat",
            missingInfo: "array of string, các thông tin còn thiếu cần hỏi",
            clarifyingQuestions: "array of 1-3 string, câu hỏi làm rõ (tiếng Việt, ngắn gọn)",
            canSuggestPackages: "boolean, có thể gợi ý gói/xét nghiệm không",
            suggestedPackageHints: "array of string, mã gói từ catalog: CBC, LIVER_FUNCTION, KIDNEY_FUNCTION, GENERAL_CHECKUP, LIPID_PROFILE, HBA1C",
            safetyNotes: "array of string, ghi chú an toàn (nếu có)",
            shouldUseSemantic: "boolean, kết quả này có nên dùng không",
            reason: "string, lý do ngắn",
            confidence: "number từ 0 đến 1"
        }, null, 2),
        "",
        "GIẢI THÍCH userGoal:",
        "- symptom_advice: Người dùng mô tả triệu chứng và hỏi tư vấn.",
        "- test_advice: Người dùng hỏi nên xét nghiệm gì.",
        "- test_explanation: Người dùng hỏi giải thích xét nghiệm/chỉ số.",
        "- lifestyle_health_guidance: Người dùng hỏi lời khuyên sức khỏe/lifestyle (huyết áp, mỡ máu, đường huyết, ăn uống, vận động).",
        "- lab_result_severity: Người dùng hỏi chỉ số xét nghiệm cao/thấp có nguy hiểm/nghiêm trọng không.",
        "- read_only_consultation: Người dùng nói chỉ hỏi trước, chưa muốn đặt lịch, chỉ muốn tư vấn.",
        "- package_recommendation_ready: Người dùng đủ thông tin và sẵn sàng nhận gợi ý gói.",
        "- urgent_health: Có dấu hiệu nguy hiểm (đau ngực, khó thở, ngất, sốt cao + lơ mơ, vã mồ hôi, ho ra máu, phân đen, liệt nửa người, co giật).",
        "- unclear_health_request: Không rõ người dùng hỏi gì.",
        "",
        "Catalog gói/xét nghiệm có sẵn:",
        packageHints,
        "",
        "LỊCH SỬ HỘI THOẠI GẦN NHẤT:",
        conversationHistory,
        "",
        "BỐI CẢNH HIỆN TẠI (tóm tắt):",
        contextSummary,
        missingInfo ? `Thông tin còn thiếu: ${missingInfo}` : "",
        "",
        "TIN NHẮN HIỆN TẠI:",
        message || "",
        "",
        "HƯỚNG DẪN HỎI LÀM RÕ (nếu thiếu thông tin):",
        "- Nếu thiếu tuổi: hỏi bao nhiêu tuổi.",
        "- Nếu thiếu thời gian/khoảng thời gian: hỏi bao lâu, bao nhiêu ngày/tuần.",
        "- Nếu chưa rõ mức độ: hỏi có kèm dấu hiệu gì khác không.",
        "- Nếu lo ngại nguy hiểm: hỏi về đau ngực, khó thở, ngất, sốt cao, tình trạng xấu đi nhanh.",
        "",
        "HƯỚNG DẪN GỢI Ý GÓI (chỉ khi đủ thông tin và AN TOÀN):",
        "- Mệt chung + ăn uống kém: có thể gợi ý CBC, GENERAL_CHECKUP.",
        "- Lo ngại gan (uống rượu/bia): có thể gợi ý LIVER_FUNCTION.",
        "- Lo ngại thận (phù chân, tiểu khó): có thể gợi ý KIDNEY_FUNCTION.",
        "- Kiểm tra tổng quát: có thể gợi ý GENERAL_CHECKUP.",
        "- KHÔNG gợi ý nếu có dấu hiệu urgent_health.",
        "",
        "QUAN TRỌNG:",
        "- Nếu có dấu hiệu urgent_health: set userGoal=urgent_health, canSuggestPackages=false, thêm vào safetyNotes.",
        "- Nếu thiếu thông tin: set missingInfo, clarifyingQuestions, canSuggestPackages=false.",
        "- Nếu chỉ hỏi giải thích: set userGoal=test_explanation.",
        "- Nếu đủ thông tin và an toàn: set canSuggestPackages=true, thêm suggestedPackageHints.",
        "",
        "Trả về MỘT JSON object, không có gì khác."
    ].join("\n");
}

function normalizeSemanticOutput(raw, input = {}) {
    if (!raw || typeof raw !== "object") {
        return null;
    }

    const userGoal = USER_GOAL_TYPES.includes(raw.userGoal) ? raw.userGoal : "unclear_health_request";
    const missingInfo = Array.isArray(raw.missingInfo) ? raw.missingInfo : [];
    const clarifyingQuestions = Array.isArray(raw.clarifyingQuestions)
        ? raw.clarifyingQuestions.filter(Boolean).slice(0, 3)
        : [];
    const suggestedPackageHints = Array.isArray(raw.suggestedPackageHints)
        ? raw.suggestedPackageHints.filter(Boolean)
        : [];
    const safetyNotes = Array.isArray(raw.safetyNotes) ? raw.safetyNotes.filter(Boolean) : [];
    const confidence = typeof raw.confidence === "number" ? raw.confidence : 0.5;

    return {
        version: raw.version || SEMANTIC_VERSION,
        provider: raw.provider || PROVIDER_NAME,
        userGoal,
        summary: String(raw.summary || "").trim(),
        missingInfo,
        clarifyingQuestions,
        canSuggestPackages: Boolean(raw.canSuggestPackages),
        suggestedPackageHints,
        safetyNotes,
        shouldUseSemantic: raw.shouldUseSemantic !== false,
        reason: String(raw.reason || "semantic_analysis_completed"),
        confidence
    };
}

function buildFallbackOutput(fallbackReason, extra = {}) {
    return {
        version: SEMANTIC_VERSION,
        provider: PROVIDER_NAME,
        fallbackReason,
        userGoal: "unclear_health_request",
        summary: "",
        missingInfo: [],
        clarifyingQuestions: [],
        canSuggestPackages: false,
        suggestedPackageHints: [],
        safetyNotes: [],
        shouldUseSemantic: false,
        reason: fallbackReason,
        confidence: 0,
        ...extra
    };
}

async function analyzeHealthConsultationWithOllama(input = {}, options = {}) {
    const config = {
        ...getConfig(options.env || process.env),
        ...(options.baseUrl ? { baseUrl: String(options.baseUrl).replace(/\/+$/, "") } : {}),
        ...(options.model ? { model: options.model } : {}),
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {})
    };

    const fetchImpl = options.fetchImpl || global.fetch;
    const startedAt = Date.now();

    if (typeof fetchImpl !== "function") {
        return buildFallbackOutput("provider_fetch_unavailable", {
            elapsedMs: Date.now() - startedAt,
            errorCode: "fetch_unavailable"
        });
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), config.timeoutMs) : null;

    try {
        const response = await fetchImpl(`${config.baseUrl}/api/generate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: config.model,
                prompt: buildHealthConsultationPrompt(input),
                stream: false,
                format: "json",
                options: {
                    temperature: 0
                }
            }),
            ...(controller ? { signal: controller.signal } : {})
        });

        const elapsedMs = Date.now() - startedAt;

        if (!response.ok) {
            const errorText = await readResponseText(response);
            const fallbackReason = isModelMissing(response.status, errorText)
                ? "provider_model_missing"
                : "provider_http_error";

            return buildFallbackOutput(fallbackReason, {
                elapsedMs,
                fetchStatus: response.status,
                errorText: errorText.slice(0, 200)
            });
        }

        let payload;
        try {
            payload = await response.json();
        } catch {
            return buildFallbackOutput("provider_malformed_json", { elapsedMs });
        }

        const rawResponse = payload?.response;
        if (!rawResponse) {
            return buildFallbackOutput("provider_empty_response", { elapsedMs });
        }

        let parsed;
        try {
            const text = stripJsonFence(rawResponse);
            parsed = JSON.parse(text);
        } catch {
            return buildFallbackOutput("provider_invalid_json", {
                elapsedMs,
                rawResponse: String(rawResponse).slice(0, 500)
            });
        }

        const normalized = normalizeSemanticOutput(parsed, input);
        if (!normalized) {
            return buildFallbackOutput("provider_invalid_schema", { elapsedMs });
        }

        if (normalized.confidence < 0.3) {
            return buildFallbackOutput("provider_low_confidence", {
                elapsedMs,
                confidence: normalized.confidence
            });
        }

        return {
            ...normalized,
            elapsedMs
        };
    } catch (error) {
        const elapsedMs = Date.now() - startedAt;
        const fallbackReason = error?.name === "AbortError"
            ? "provider_timeout"
            : isConnectionError(error)
                ? "provider_connection_failed"
                : "provider_exception";

        return buildFallbackOutput(fallbackReason, {
            elapsedMs,
            errorName: error?.name || null,
            errorCode: error?.cause?.code || error?.code || null,
            errorMessage: String(error?.message || "").slice(0, 200)
        });
    } finally {
        if (timeout) {
            clearTimeout(timeout);
        }
    }
}

function mergeSemanticWithContext(ruleContext, semanticResult) {
    if (!semanticResult || semanticResult.fallbackReason) {
        return ruleContext;
    }

    const merged = { ...ruleContext };

    if (semanticResult.userGoal && semanticResult.userGoal !== "unclear_health_request") {
        merged.userGoal = semanticResult.userGoal;
    }

    if (semanticResult.summary) {
        merged.semanticSummary = semanticResult.summary;
    }

    if (semanticResult.missingInfo.length > 0) {
        merged.semanticMissingInfo = semanticResult.missingInfo;
    }

    if (semanticResult.clarifyingQuestions.length > 0) {
        merged.semanticClarifyingQuestions = semanticResult.clarifyingQuestions;
    }

    if (semanticResult.canSuggestPackages && ruleContext.canSuggestPackages) {
        merged.canSuggestPackages = true;
        if (semanticResult.suggestedPackageHints.length > 0) {
            merged.semanticSuggestedPackageHints = semanticResult.suggestedPackageHints;
        }
    }

    if (semanticResult.safetyNotes.length > 0) {
        merged.semanticSafetyNotes = semanticResult.safetyNotes;
    }

    if (semanticResult.userGoal === "urgent_health" && !merged.needsUrgentCare) {
        merged.semanticUrgentFlag = true;
    }

    merged.semanticAssist = {
        used: true,
        provider: semanticResult.provider,
        confidence: semanticResult.confidence,
        reason: semanticResult.reason
    };

    return merged;
}

module.exports = {
    SEMANTIC_VERSION,
    PROVIDER_NAME,
    buildHealthConsultationPrompt,
    analyzeHealthConsultationWithOllama,
    mergeSemanticWithContext,
    buildFallbackOutput,
    normalizeSemanticOutput
};
