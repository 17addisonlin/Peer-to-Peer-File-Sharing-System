// Global variables for WebRTC connection
let localConnection;
let remoteConnection;
let sendChannel;
let receiveChannel;
let fileInput = document.getElementById('fileInput');
let receivedFileElement = document.getElementById('receivedFile');

// Function to start receiving a file (when "Start Receiving" is clicked)
function startReceiving() {
  console.log("Starting to receive...");

  // Create a new connection for receiving data
  localConnection = new RTCPeerConnection();

  // Set up data channel for receiving file
  localConnection.ondatachannel = (event) => {
    receiveChannel = event.channel;
    receiveChannel.onmessage = receiveMessage;
    receiveChannel.onopen = () => console.log("Data channel opened for receiving.");
    receiveChannel.onclose = () => console.log("Data channel closed for receiving.");
  };

  // Create an offer to send to the other peer (this will be sent via signaling)
  localConnection.createOffer().then((offer) => {
    return localConnection.setLocalDescription(offer);
  }).then(() => {
    // Send offer to the signaling server (not implemented yet)
    console.log("Offer created and set as local description.");
  }).catch(handleError);
}

// Function to send a file (when "Send File" is clicked)
function sendFile() {
  if (fileInput.files.length === 0) {
    alert("Please select a file to send.");
    return;
  }

  let file = fileInput.files[0];

  // Create the remote peer connection
  remoteConnection = new RTCPeerConnection();

  // Create a data channel to send the file
  sendChannel = remoteConnection.createDataChannel("sendDataChannel");

  // Open the data channel when it's ready
  sendChannel.onopen = () => {
    console.log("Data channel opened for sending file.");
    sendFileData(file);
  };

  sendChannel.onclose = () => {
    console.log("Data channel closed for sending file.");
  };

  // Set up ICE candidates (network info for connecting peers)
  remoteConnection.onicecandidate = (event) => {
    if (event.candidate) {
      // Send candidate info to the signaling server (not implemented yet)
      console.log("ICE candidate:", event.candidate);
    }
  };

  // Create an offer to send to the receiving peer
  remoteConnection.createOffer().then((offer) => {
    return remoteConnection.setLocalDescription(offer);
  }).then(() => {
    // Send offer to the signaling server (not implemented yet)
    console.log("Offer created and set as local description for sending.");
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

  // For now, let's just display the received data (i.e., filename or content)
  receivedFileElement.textContent = `Received data: ${receivedData}`;
  console.log("Received message:", receivedData);
}

// Error handling
function handleError(error) {
  console.error("Error:", error);
}
