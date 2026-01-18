import WebSocket, { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });
const rooms = new Map();

function addToRoom(roomId, ws) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId).add(ws);
  ws.roomId = roomId;
}

function removeFromRoom(ws) {
  if (!ws.roomId || !rooms.has(ws.roomId)) {
    return;
  }
  const room = rooms.get(ws.roomId);
  room.delete(ws);
  if (room.size === 0) {
    rooms.delete(ws.roomId);
  }
  ws.roomId = null;
}

wss.on('connection', (ws) => {
  console.log('A new client connected.');

  // When the server receives a message from a client
  ws.on('message', (message) => {
    const data = message.toString();
    console.log('Received:', data);

    let payload;
    try {
      payload = JSON.parse(data);
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON payload.' }));
      return;
    }

    if (payload.type === 'join') {
      if (!payload.roomId || !/^\d{4}$/.test(payload.roomId)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid room PIN.' }));
        return;
      }

      const existingRoom = rooms.get(payload.roomId);
      if (existingRoom && existingRoom.size >= 2) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full.' }));
        return;
      }

      removeFromRoom(ws);
      addToRoom(payload.roomId, ws);
      ws.send(JSON.stringify({ type: 'joined', roomId: payload.roomId }));
      return;
    }

    if (!ws.roomId || !rooms.has(ws.roomId)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Join a room first.' }));
      return;
    }

    // Broadcast the message to all other clients in the same room
    rooms.get(ws.roomId).forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  });

  ws.on('close', () => {
    removeFromRoom(ws);
    console.log('Client disconnected.');
  });
});

console.log('Signaling server running at ws://localhost:8080');
