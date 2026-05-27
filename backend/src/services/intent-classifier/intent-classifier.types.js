const INTENT_GROUPS = {
    BOOKING: "booking",
    HEALTH_RAG: "health_rag",
    TEST_ADVICE: "test_advice",
    PACKAGE_INFO: "package_info",
    URGENT_HEALTH: "urgent_health",
    UNKNOWN: "unknown"
};

const CONVERSATION_ACTS = {
    FINAL_CONFIRM: "final_confirm",
    PAUSE_OR_HOLD: "pause_or_hold",
    RESUME_AFTER_PAUSE: "resume_after_pause",
    INFO_DETOUR: "info_detour",
    AVAILABILITY_INQUIRY: "availability_inquiry",
    EDIT_REQUEST: "edit_request",
    CANCEL_OR_ABORT: "cancel_or_abort",
    REVIEW_DRAFT: "review_draft",
    HELP_NEXT_STEP: "help_next_step",
    FIELD_VALUE: "field_value",
    UNCLEAR: "unclear"
};

const TARGET_TYPES = {
    CURRENT_BOOKING_DRAFT: "current_booking_draft",
    EXISTING_BOOKING: "existing_booking",
    PACKAGE: "package",
    FIELD: "field",
    MEDICAL_TOPIC: "medical_topic",
    UNKNOWN: "unknown"
};

const TARGET_FIELDS = {
    APPOINTMENT_TIME: "appointmentTime",
    APPOINTMENT_DATE: "appointmentDate",
    ADDRESS: "address",
    PATIENT_NAME: "patientName",
    PACKAGE: "package"
};

const SAFETY_DECISIONS = {
    ALLOW_READ_ONLY: "allow_read_only",
    ASK_CLARIFICATION: "ask_clarification",
    ASK_CONFIRMATION: "ask_confirmation",
    BLOCK_MUTATION: "block_mutation",
    ALLOW_GUARDED_MUTATION: "allow_guarded_mutation"
};

const PROVIDERS = {
    DETERMINISTIC_STUB: "deterministic_stub",
    LLM_SHADOW_DISABLED: "llm_shadow_provider_disabled",
    OLLAMA_SHADOW: "ollama_shadow"
};

const INTENT_GROUP_VALUES = Object.values(INTENT_GROUPS);
const CONVERSATION_ACT_VALUES = Object.values(CONVERSATION_ACTS);
const TARGET_TYPE_VALUES = Object.values(TARGET_TYPES);
const TARGET_FIELD_VALUES = Object.values(TARGET_FIELDS);
const SAFETY_DECISION_VALUES = Object.values(SAFETY_DECISIONS);

function normalizeFieldName(field) {
    if (field === "testType") return TARGET_FIELDS.PACKAGE;
    return TARGET_FIELD_VALUES.includes(field) ? field : undefined;
}

module.exports = {
    INTENT_GROUPS,
    CONVERSATION_ACTS,
    TARGET_TYPES,
    TARGET_FIELDS,
    SAFETY_DECISIONS,
    PROVIDERS,
    INTENT_GROUP_VALUES,
    CONVERSATION_ACT_VALUES,
    TARGET_TYPE_VALUES,
    TARGET_FIELD_VALUES,
    SAFETY_DECISION_VALUES,
    normalizeFieldName
};
