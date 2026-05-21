const userAuthService = require("../services/user-auth.service");

function sendAuthError(res, result) {
    return res.status(result.statusCode || 400).json({
        success: false,
        code: result.code,
        message: result.message
    });
}

async function login(req, res, next) {
    try {
        const result = await userAuthService.loginUser({
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

async function register(req, res, next) {
    try {
        const result = await userAuthService.registerUser({
            name: req.body?.name,
            email: req.body?.email,
            phone: req.body?.phone,
            password: req.body?.password
        });

        if (!result.ok) {
            return sendAuthError(res, result);
        }

        return res.status(201).json({
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
    login,
    register
};
