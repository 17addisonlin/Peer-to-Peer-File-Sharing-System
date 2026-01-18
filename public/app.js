// Global variables for WebRTC connection
let peerConnection;
let sendChannel;
let receiveChannel;
let fileInput = document.getElementById('fileInput');
let receivedFileElement = document.getElementById('receivedFile');
let receivedChunks = [];
let pendingCandidates = [];
let selectedFileName = document.getElementById('selectedFileName');
let sendStatus = document.getElementById('sendStatus');
let receiveStatus = document.getElementById('receiveStatus');
let pinInput = document.getElementById('pinInput');
let pinDisplay = document.getElementById('pinDisplay');
let roomId = null;
let isPolite = false;
let isMakingOffer = false;
let ignoreOffer = false;
let joinedRoom = false;

// Connect to the signaling server (WebSocket server)
const signalingServer = new WebSocket(`ws://${location.hostname}:8080`);

signalingServer.onopen = () => {
  console.log("Connected to signaling server");
  if (receiveStatus) {
    receiveStatus.textContent = "Connected to signaling server";
  }
};
signalingServer.onerror = (error) => {
  console.error("Signaling server error:", error);
};
signalingServer.onclose = () => {
  console.warn("Disconnected from signaling server");
  if (receiveStatus) {
    receiveStatus.textContent = "Signaling server disconnected";
  }
};

// Handle messages received from the signaling server
signalingServer.onmessage = (message) => {
  console.log('Received message from signaling server: ', message.data);
  const signal = JSON.parse(message.data);

  if (signal.type === "offer") {
    handleOffer(signal.offer);
  } else if (signal.type === "answer") {
    handleAnswer(signal.answer);
  } else if (signal.type === "candidate") {
    handleCandidate(signal.candidate);
  } else if (signal.type === "joined") {
    joinedRoom = true;
  } else if (signal.type === "error") {
    alert(signal.message || "Signaling server error");
  }
};

// Function to send signaling messages to the server
function sendToSignalingServer(message) {
  if (signalingServer.readyState !== WebSocket.OPEN) {
    throw new Error("Signaling server is not connected.");
  }
  signalingServer.send(JSON.stringify(message));
}

function createPeerConnection() {
  if (peerConnection) {
    return peerConnection;
  }

  peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendToSignalingServer({ type: 'candidate', candidate: event.candidate, roomId });
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.log("ICE state:", peerConnection.iceConnectionState);
  };

  peerConnection.ondatachannel = (event) => {
    receiveChannel = event.channel;
    receiveChannel.binaryType = 'arraybuffer';
    receiveChannel.onmessage = receiveMessage;
    receiveChannel.onopen = () => console.log("Data channel opened for receiving.");
    receiveChannel.onclose = () => console.log("Data channel closed for receiving.");
  };

  peerConnection.onnegotiationneeded = async () => {
    try {
      isMakingOffer = true;
      await peerConnection.setLocalDescription();
      sendToSignalingServer({ type: 'offer', offer: peerConnection.localDescription, roomId });
    } catch (error) {
      handleError(error);
    } finally {
      isMakingOffer = false;
    }
  };

  return peerConnection;
}

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function joinRoom(targetRoomId, role) {
  roomId = targetRoomId;
  isPolite = role === 'receiver';
  sendToSignalingServer({ type: 'join', roomId, role });
}

// Function to start receiving a file (when "Start Receiving" is clicked)
function startReceiving() {
  console.log("Starting to receive...");
  if (receiveStatus) {
    receiveStatus.textContent = "Listening for an offer...";
  }

  if (!roomId) {
    roomId = generatePin();
  }

  if (pinDisplay) {
    pinDisplay.textContent = roomId;
  }

  try {
    joinRoom(roomId, 'receiver');
  } catch (error) {
    handleError(error);
    return;
  }

  createPeerConnection();
}

// Function to handle the offer received from the other peer
function handleOffer(offer) {
  createPeerConnection();

  const offerDescription = new RTCSessionDescription(offer);
  const offerCollision = isMakingOffer || peerConnection.signalingState !== "stable";
  ignoreOffer = !isPolite && offerCollision;

  if (ignoreOffer) {
    return;
  }

  peerConnection.setRemoteDescription(offerDescription)
    .then(() => flushPendingCandidates(peerConnection))
    .then(() => peerConnection.setLocalDescription())
    .then(() => {
      sendToSignalingServer({ type: 'answer', answer: peerConnection.localDescription, roomId });
    })
    .catch(handleError);
}

// Function to handle the answer received from the other peer
function handleAnswer(answer) {
  if (!peerConnection) {
    return;
  }

  peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
    .then(() => flushPendingCandidates(peerConnection))
    .catch(handleError);
}

// Function to handle the ICE candidate received from the other peer
function handleCandidate(candidate) {
  if (ignoreOffer) {
    return;
  }

  if (peerConnection && peerConnection.remoteDescription) {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      .catch(handleError);
  } else {
    pendingCandidates.push(candidate);
  }
}

// Function to send a file (when "Send File" is clicked)
function sendFile() {
  if (fileInput.files.length === 0) {
    alert("Please select a file to send.");
    return;
  }

  let file = fileInput.files[0];
  const enteredPin = pinInput ? pinInput.value.trim() : '';
  if (!/^\d{4}$/.test(enteredPin)) {
    alert("Enter the 4-digit PIN from the receiving device.");
    return;
  }

  try {
    if (!joinedRoom || roomId !== enteredPin) {
      joinRoom(enteredPin, 'sender');
    }
  } catch (error) {
    handleError(error);
    return;
  }

  if (sendStatus) {
    sendStatus.textContent = `Preparing to send ${file.name}`;
  }

  // Create the peer connection
  createPeerConnection();

  // Create a data channel to send the file
  sendChannel = peerConnection.createDataChannel("sendDataChannel");

  // Open the data channel when it's ready
  sendChannel.onopen = () => {
    console.log("Data channel opened for sending file.");
    if (sendStatus) {
      sendStatus.textContent = `Sending ${file.name}...`;
    }
    sendFileData(file);
  };

  sendChannel.onclose = () => {
    console.log("Data channel closed for sending file.");
    if (sendStatus) {
      sendStatus.textContent = "Send channel closed";
    }
  };

  // Negotiation handled by onnegotiationneeded.
}

// Function to send file data through the data channel
function sendFileData(file) {
  const chunkSize = 16384; // 16 KB per chunk
  let offset = 0;

  const reader = new FileReader();

  // Read the file in chunks and send via the data channel
  reader.onload = function(event) {
    sendChannel.send(event.target.result);
    offset += event.target.result.byteLength;

    // If there is more data to send, read the next chunk
    if (offset < file.size) {
      readNextChunk();
    } else {
      console.log("File sent successfully.");
      sendChannel.send(JSON.stringify({ type: 'done' }));
      if (sendStatus) {
        sendStatus.textContent = `Sent ${file.name}`;
      }
    }
  };

  function readNextChunk() {
    const slice = file.slice(offset, offset + chunkSize);
    reader.readAsArrayBuffer(slice);
  }

  readNextChunk();
}

// Function to receive the file data
function receiveMessage(event) {
  const receivedData = event.data;

  if (typeof receivedData === 'string') {
    try {
      const message = JSON.parse(receivedData);
      if (message.type === 'done') {
        const blob = new Blob(receivedChunks);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'received-file';
        link.textContent = 'Download received file';
        receivedFileElement.innerHTML = '';
        receivedFileElement.appendChild(link);
        receivedChunks = [];
        if (receiveStatus) {
          receiveStatus.textContent = "File received";
        }
        return;
      }
    } catch (err) {
      // Non-JSON string; fall through to logging.
    }
  }

  if (receivedData instanceof ArrayBuffer) {
    receivedChunks.push(receivedData);
  }

  console.log("Received message:", receivedData);
}

function flushPendingCandidates(connection) {
  if (!connection || !connection.remoteDescription) {
    return;
  }

  pendingCandidates.forEach((candidate) => {
    connection.addIceCandidate(new RTCIceCandidate(candidate))
      .catch(handleError);
  });
  pendingCandidates = [];
}

// Error handling
function handleError(error) {
  console.error("Error:", error);
  if (sendStatus) {
    sendStatus.textContent = "Error occurred while sending";
  }
  if (receiveStatus) {
    receiveStatus.textContent = "Error occurred while receiving";
  }
}

if (fileInput && selectedFileName) {
  fileInput.addEventListener('change', () => {
    selectedFileName.textContent = fileInput.files[0]?.name || "No file selected";
  });
}

if (pinInput) {
  pinInput.addEventListener('input', () => {
    pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 4);
  });
}
