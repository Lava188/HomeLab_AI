const passwordAuthService = require("../services/password-auth.service");

function sendAuthError(res, result) {
    return res.status(result.statusCode || 400).json({
        success: false,
        code: result.code,
        message: result.message
    });
}

async function loginAdmin(req, res, next) {
    try {
        const result = await passwordAuthService.loginAdmin({
            phone: req.body?.phone,
            password: req.body?.password
        });

        if (!result.ok) {
            return sendAuthError(res, result);
        }

        return res.status(200).json({
            success: true,
            data: {
                session: result.session
            }
        });
    } catch (error) {
        next(error);
    }
}

async function loginCollector(req, res, next) {
    try {
        const result = await passwordAuthService.loginCollector({
            phone: req.body?.phone,
            password: req.body?.password
        });

        if (!result.ok) {
            return sendAuthError(res, result);
        }

        return res.status(200).json({
            success: true,
            data: {
                session: result.session
            }
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    loginAdmin,
    loginCollector
};
