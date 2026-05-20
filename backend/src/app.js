const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

const chatRoute = require("./routes/chat.route");
const debugRoute = require("./routes/debug.route");
const adminBookingRoute = require("./routes/admin-booking.route");
const adminCollectorAssignmentRoute = require("./routes/admin-collector-assignment.route");
const adminAvailabilitySlotRoute = require("./routes/admin-availability-slot.route");
const adminAuthRoute = require("./routes/admin-auth.route");
const adminStaffRoute = require("./routes/admin-staff.route");
const userAuthRoute = require("./routes/user-auth.route");
const collectorAuthRoute = require("./routes/collector-auth.route");
const userBookingRoute = require("./routes/user-booking.route");
const collectorBookingRoute = require("./routes/collector-booking.route");
const collectorWorkingAreaRoute = require("./routes/collector-working-area.route");
const collectorWorkingScheduleRoute = require("./routes/collector-working-schedule.route");
const collectorAssignmentRoute = require("./routes/collector-assignment.route");
const labResultRoute = require("./routes/lab-result.route");

dotenv.config({
  path: path.join(__dirname, "../.env")
});
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "HomeLab backend is running"
  });
});

// Main API routes
app.use("/api/chat", chatRoute);
app.use("/api/debug", debugRoute);
app.use("/api/admin/bookings", adminBookingRoute);
app.use("/api/admin/collector-assignments", adminCollectorAssignmentRoute);
app.use("/api/admin/availability-slots", adminAvailabilitySlotRoute);
app.use("/api/admin/auth", adminAuthRoute);
app.use("/api/admin/staff", adminStaffRoute);
app.use("/api/user/auth", userAuthRoute);
app.use("/api/collector/auth", collectorAuthRoute);
app.use("/api/user/bookings", userBookingRoute);
app.use("/api/collector/bookings", collectorBookingRoute);
app.use("/api/collector/working-areas", collectorWorkingAreaRoute);
app.use("/api/collector/working-schedules", collectorWorkingScheduleRoute);
app.use("/api/collector/assignments", collectorAssignmentRoute);
app.use("/api/lab-results", labResultRoute);

// 404 handler
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global error:", err);

  return res.status(500).json({
    success: false,
    message: "Internal server error"
  });
});

app.listen(PORT, () => {
  console.log(`HomeLab backend is running on port ${PORT}`);
});
