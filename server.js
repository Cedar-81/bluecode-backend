require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const crypto = require("crypto");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" }, // Allow all origins (update for security)
});

app.use(bodyParser.json());

// Store connected clients
let clients = [];

// Handle WebSocket connections
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  clients.push(socket);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    clients = clients.filter((client) => client.id !== socket.id);
  });
});

// Bluecode Transaction Callback URL
app.post("/transaction-callback", (req, res) => {
  const secretKey = process.env.MERCHANT_SECRET_KEY; // Load from .env
  const signatureHeader = req.headers["x-blue-code-signature"];

  if (!signatureHeader) {
    return res.status(400).json({ error: "Missing signature" });
  }

  const bodyString = JSON.stringify(req.body);
  const [timestamp, receivedSignature] = signatureHeader
    .split(",")
    .map((s) => s.split("=")[1]);

  // Generate HMAC-SHA256 signature
  const calculatedSignature = crypto
    .createHmac("sha256", secretKey)
    .update(`${timestamp}.${bodyString}`)
    .digest("hex");

  // Verify signature
  if (calculatedSignature !== receivedSignature) {
    return res.status(403).json({ error: "Invalid signature" });
  }

  console.log("✅ Valid Bluecode request received:", req.body);

  // Emit update to connected clients via WebSocket
  io.emit("transaction_update", req.body);

  res.status(200).json({ message: "Transaction update received" });
});

// Start server
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
