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
// Store the latest transaction and its timestamp
let latestTransaction = null;
let transactionPending = false;

// Handle WebSocket connections
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  clients.push(socket);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    clients = clients.filter((client) => client.id !== socket.id);
  });
});

// Bluecode Transaction Callback URL (Webhook)
app.post("/transaction-callback", (req, res) => {
  console.log("inside transaction callback");

  const secretKey = process.env.MERCHANT_SECRET_KEY;
  const signatureHeader = req.headers["x-blue-code-signature"];
  console.log("signature: ", signatureHeader);

  if (!signatureHeader) {
    io.emit("error", "Missing signature");
    return res.status(400).json({ error: "Missing signature" });
  }

  const bodyString = JSON.stringify(req.body);
  const [timestamp, receivedSignature] = signatureHeader
    .split(",")
    .map((s) => s.split("=")[1]);

  console.log("bodyString: ", bodyString);

  // Generate HMAC-SHA256 signature
  const calculatedSignature = crypto
    .createHmac("sha256", secretKey)
    .update(`${timestamp}.${bodyString}`)
    .digest("hex");

  console.log("calc signature: ", calculatedSignature);

  // Uncomment this block to verify signature
  // if (calculatedSignature !== receivedSignature) {
  //   io.emit("error", "Invalid signature");
  //   return res.status(403).json({ error: "Invalid signature" });
  // }

  console.log("✅ Valid Bluecode request received:", req.body);

  // Store the latest transaction
  latestTransaction = {
    ...req.body,
    timestamp: Date.now(), // Add timestamp to track freshness
  };

  // Mark transaction as pending
  transactionPending = false;

  // Emit update to connected clients via WebSocket
  io.emit("transaction_update", latestTransaction);

  res.status(200).json({ message: "Transaction update received" });
});

// HTTP Route for Polling Transaction Status
app.get("/transaction-status", (req, res) => {
  if (!latestTransaction || transactionPending) {
    return res.status(404).json({ message: "No transaction update available" });
  }

  res.json(latestTransaction);
});

// Clear transaction data when a new payment starts
app.post("/start-transaction", (req, res) => {
  console.log("🆕 New transaction started. Clearing old data.");
  latestTransaction = null;
  transactionPending = true; // Mark as waiting for a new update
  res.json({ message: "Transaction reset. Awaiting new payment." });
});

// Start server
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
