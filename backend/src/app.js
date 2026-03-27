const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const chatRoute = require("./routes/chat.route");
const debugRoute = require("./routes/debug.route");

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