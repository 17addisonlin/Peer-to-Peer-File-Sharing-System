# Peer-to-Peer-File-Sharing-System

Simple and secured peer-to-peer file sharing using WebRTC with a WebSocket signaling server.

## Requirements
- Node.js 18+

## Install
```bash
npm install
```

## Run
Start the signaling server:
```bash
node server.js
```

In another terminal, serve the frontend:
```bash
npx serve ./public
```

Open the URL from the static server in two tabs or devices. The receiver clicks "Start Receiving" to generate a 4-digit PIN, and the sender enters that PIN before sending a file.

This is also made to implement this as a feature on a website or html page.

All content is open source under the license of use (MIT)