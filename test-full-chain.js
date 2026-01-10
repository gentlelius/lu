const io = require("socket.io-client");

const BROKER_URL = "http://localhost:3000";
const socket = io(BROKER_URL);

console.log("Connecting...");

socket.on("connect", () => {
  console.log("✅ Connected");
  socket.emit("app_auth", { token: "demo-token" });
});

socket.on("app_authenticated", () => {
  console.log("✅ Authenticated");
  const sessionId = "test-session-" + Date.now();
  console.log("🚀 Starting session:", sessionId);
  socket.emit("connect_runner", { runnerId: "runner-1", sessionId });
});

socket.on("session_created", (data) => {
  console.log("✅ Session created:", data.sessionId);
  setTimeout(() => {
    console.log("⌨️ Sending input: ls\n");
    socket.emit("terminal_input", { sessionId: data.sessionId, data: "ls\n" });
  }, 1000);
});

socket.on("terminal_output", (data) => {
  console.log("📟 Output received:", JSON.stringify(data.data));
  process.exit(0);
});

socket.on("connect_error", (err) =>
  console.error("❌ Connection error:", err.message)
);

setTimeout(() => {
  console.log("⌛ Timeout");
  process.exit(1);
}, 10000);
