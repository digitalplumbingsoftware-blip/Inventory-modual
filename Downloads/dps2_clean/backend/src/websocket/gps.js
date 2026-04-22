const { WebSocketServer, WebSocket } = require("ws");
const jwt = require("jsonwebtoken");

let wss;
const clients = new Set();

function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: "/ws/gps" });

  wss.on("connection", (ws, req) => {
    // Auth via ?token= query param
    try {
      const url = new URL(req.url, "http://localhost");
      const token = url.searchParams.get("token");
      if (!token) throw new Error("No token");
      jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      ws.close(4001, "Unauthorized");
      return;
    }

    clients.add(ws);
    console.log(`📡 GPS WS client connected (${clients.size} total)`);

    ws.on("close", () => {
      clients.delete(ws);
      console.log(`📡 GPS WS client disconnected (${clients.size} total)`);
    });

    ws.on("error", () => clients.delete(ws));

    // Acknowledge connection
    ws.send(JSON.stringify({ type: "connected", ts: new Date() }));
  });
}

// Broadcast a GPS event to all connected dashboard clients
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

module.exports = { initWebSocket, broadcast };
