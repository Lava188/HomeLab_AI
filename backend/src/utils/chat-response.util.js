function createChatResult({
    sessionId,
    userMessage,
    flow,
    action,
    reply,
    booking = null,
    meta = {}
}) {
    return {
        sessionId,
        userMessage,
        flow,
        action,
        reply,
        booking,
        meta
    };
}

module.exports = {
    createChatResult
};