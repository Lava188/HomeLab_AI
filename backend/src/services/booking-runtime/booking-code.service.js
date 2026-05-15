const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function pad(value) {
    return String(value).padStart(2, "0");
}

function randomSuffix(length = 4) {
    let suffix = "";

    for (let index = 0; index < length; index += 1) {
        suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }

    return suffix;
}

function generateBookingCode(date = new Date()) {
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());

    return `HLB-${year}${month}${day}-${randomSuffix()}`;
}

module.exports = {
    generateBookingCode
};
