const sessionStore = {};

function getSession(sessionId) {
    if (!sessionId) return null;
    return sessionStore[sessionId] || null;
}

function upsertSession(sessionId, patchData) {
    if (!sessionId) {
        throw new Error("sessionId is required");
    }

    const existingSession = sessionStore[sessionId] || {
        sessionId,
        createdAt: new Date().toISOString()
    };

    const nextSession = {
        ...existingSession,
        ...patchData,
        sessionId,
        updatedAt: new Date().toISOString()
    };

    sessionStore[sessionId] = nextSession;
    return nextSession;
}

function clearSession(sessionId) {
    if (!sessionId || !sessionStore[sessionId]) {
        return false;
    }

    delete sessionStore[sessionId];
    return true;
}

function getAllSessions() {
    return sessionStore;
}

module.exports = {
    getSession,
    upsertSession,
    clearSession,
    getAllSessions
};