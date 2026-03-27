const bookingStore = {};

function generateBookingId() {
    const timestamp = Date.now();
    const randomPart = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0");

    return `BK${timestamp}${randomPart}`;
}

function createBooking(bookingData) {
    const bookingId = generateBookingId();

    const newBooking = {
        bookingId,
        status: "confirmed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...bookingData
    };

    bookingStore[bookingId] = newBooking;
    return newBooking;
}

function getBookingById(bookingId) {
    if (!bookingId) return null;
    return bookingStore[bookingId] || null;
}

function getAllBookings() {
    return bookingStore;
}

function updateBooking(bookingId, patchData) {
    const existingBooking = getBookingById(bookingId);

    if (!existingBooking) {
        return null;
    }

    const updatedBooking = {
        ...existingBooking,
        ...patchData,
        bookingId,
        updatedAt: new Date().toISOString()
    };

    bookingStore[bookingId] = updatedBooking;
    return updatedBooking;
}

module.exports = {
    createBooking,
    getBookingById,
    getAllBookings,
    updateBooking
};