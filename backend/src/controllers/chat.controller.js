const routerService = require("../services/router.service");
const { getDemoSessionFromRequest } = require("../utils/demo-session.util");

const handleChat = async (req, res, next) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Field 'message' is required and must be a non-empty string"
      });
    }

    const currentSessionId = sessionId || `session_${Date.now()}`;

    const result = await routerService.routeMessage({
      message: message.trim(),
      sessionId: currentSessionId,
      userSession: getDemoSessionFromRequest(req)
    });

    return res.status(200).json({
      success: true,
      data: {
        ...result,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleChat
};
