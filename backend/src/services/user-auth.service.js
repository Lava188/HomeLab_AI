const passwordAuthService = require("./password-auth.service");

module.exports = {
    normalizePhone: passwordAuthService.normalizePhone,
    loginUser: passwordAuthService.loginUser,
    registerUser: passwordAuthService.registerUser
};
