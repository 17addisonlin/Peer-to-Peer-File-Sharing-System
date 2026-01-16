// Global variables for WebRTC connection
let localConnection;
let remoteConnection;
let sendChannel;
let receiveChannel;
let fileInput = document.getElementById('fileInput');
let receivedFileElement = document.getElementById('receivedFile');
let receivedChunks = [];
let pendingCandidates = [];
let selectedFileName = document.getElementById('selectedFileName');
let sendStatus = document.getElementById('sendStatus');
let receiveStatus = document.getElementById('receiveStatus');

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
  }
};

// Function to send signaling messages to the server
function sendToSignalingServer(message) {
  signalingServer.send(JSON.stringify(message));
}

function createPeerConnection() {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
  pc.oniceconnectionstatechange = () => {
    console.log("ICE state:", pc.iceConnectionState);
  };
  return pc;
}

// Function to start receiving a file (when "Start Receiving" is clicked)
function startReceiving() {
  console.log("Starting to receive...");
  if (receiveStatus) {
    receiveStatus.textContent = "Listening for an offer...";
  }

  // Create a new connection for receiving data
  localConnection = createPeerConnection();

  localConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendToSignalingServer({ type: 'candidate', candidate: event.candidate });
    }
  };

  // Set up data channel for receiving file
  localConnection.ondatachannel = (event) => {
    receiveChannel = event.channel;
    receiveChannel.binaryType = 'arraybuffer';
    receiveChannel.onmessage = receiveMessage;
    receiveChannel.onopen = () => console.log("Data channel opened for receiving.");
    receiveChannel.onclose = () => console.log("Data channel closed for receiving.");
  };
}

// Function to handle the offer received from the other peer
function handleOffer(offer) {
  if (!localConnection) {
    startReceiving();
  }

  localConnection.setRemoteDescription(new RTCSessionDescription(offer))
    .then(() => flushPendingCandidates(localConnection))
    .then(() => localConnection.createAnswer())
    .then((answer) => {
      localConnection.setLocalDescription(answer);
      sendToSignalingServer({ type: 'answer', answer: answer });
    }).catch(handleError);
}

// Function to handle the answer received from the other peer
function handleAnswer(answer) {
  if (remoteConnection) {
    remoteConnection.setRemoteDescription(new RTCSessionDescription(answer))
      .then(() => flushPendingCandidates(remoteConnection))
      .catch(handleError);
  }
}

// Function to handle the ICE candidate received from the other peer
function handleCandidate(candidate) {
  const connection = remoteConnection || localConnection;
  if (connection && connection.remoteDescription) {
    connection.addIceCandidate(new RTCIceCandidate(candidate))
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
  if (sendStatus) {
    sendStatus.textContent = `Preparing to send ${file.name}`;
  }

  // Create the remote peer connection
  remoteConnection = createPeerConnection();

  // Create a data channel to send the file
  sendChannel = remoteConnection.createDataChannel("sendDataChannel");

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

  // Set up ICE candidates (network info for connecting peers)
  remoteConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendToSignalingServer({ type: 'candidate', candidate: event.candidate });
    }
  };

  // Create an offer to send to the receiving peer
  remoteConnection.createOffer().then((offer) => {
    return remoteConnection.setLocalDescription(offer);
  }).then(() => {
    sendToSignalingServer({ type: 'offer', offer: remoteConnection.localDescription });
  }).catch(handleError);
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
