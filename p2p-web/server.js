import WebSocket, { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('A new client connected.');

  // When the server receives a message from a client
  ws.on('message', (message) => {
    const data = message.toString();
    console.log('Received:', data);

    // Broadcast the message to all other clients
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  });

  ws.on('close', () => {
    console.log('Client disconnected.');
  });
});

console.log('Signaling server running at ws://localhost:8080');
