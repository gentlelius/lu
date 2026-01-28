const io = require("socket.io-client");

const socket = io("http://115.191.40.55:3000");

console.log("Connecting...");

socket.on("connect", () => {
  console.log("✅ Connected, sending auth...");
  socket.emit("app_auth", { token: "demo-token" });
});

socket.on("app_authenticated", (data) => {
  console.log("✅ Authenticated successfully:", data);
  process.exit(0);
});

socket.on("connect_error", (err) => {
  console.error("❌ Connection error:", err.message);
  process.exit(1);
});

socket.on("error", (err) => {
  console.error("❌ Server error:", err);
  process.exit(1);
});

setTimeout(() => {
  console.log("⌛ Timeout");
  process.exit(1);
}, 5000);
