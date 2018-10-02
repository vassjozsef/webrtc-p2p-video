var websocket = null;;
var localStream = null;
var peerConnection = null;
var peer = null;
var user = null;
var cachedIceCandidates = [];

const statisticsArea = document.getElementById('statisticsArea');
const remoteVideo = document.getElementById('remoteVideo');
const textarea = document.getElementById("statusArea");

const offerOptions = {
  offerToReceiveAudio: 1,
  offerToReceiveVideo: 1
};

function clearStatus() {
  textarea.innerHTML = "";
}

function status(msg) {
   textarea.innerHTML += msg;
   console.info(msg);
}
      
function connect() {
  if (websocket) {
    status('Already conencted\n');
    return;
  }
  const host = location.origin.replace(/^http/, 'ws')
  user = document.getElementById('userInput').value;
  if (!user.length) {
    status('Please specify user to connect\n');
    return;
  }
  websocket = new WebSocket(host);
  websocket.onopen = (open) => {
    status(`WebSocket opened: ${open.target.url}\n`);
    const message = `{"command": "REGISTER", "from": "${user}"}`;
    websocket.send(message);
  };

  websocket.onerror = (error) => {
    status(`Websocket error ${error}\n`);
    websocket = null;
  };

  websocket.onclose = (close) => {
    status('WebSocket closed\n');
    websocket = null;
  };

  websocket.onmessage = (message) => {
    let m = JSON.parse(message.data);
    status(`Received message: ${m.command}\n`);
    if (m.command === 'INVITE') {
      peer = m.from;
      peerElement = document.getElementById("peerInput");
      peerElement.value = peer;

      const constraints = {audio: true, video: true};
      navigator.mediaDevices.getUserMedia(constraints).then(stream => {
        localStream = stream;
        createPeerConnection();

        localStream.getTracks().forEach(track => {
          status(`Adding local track: ${track.kind}\n`);
          peerConnection.addTrack(track, localStream);
        });

        createAnswer(new RTCSessionDescription(m.desc));
      }).catch(error => {
        status(`getUserMedia error: ${error.toString()}\n`);
      });
    } else if (m.command === 'ANSWER') {
      peerConnection.setRemoteDescription(new RTCSessionDescription(m.desc)).catch(error => {
        status(`Failed to set remote description: ${error.toString()}\n`);
      });
    } else if (m.command === 'CANDIDATE') {
      let c = new RTCIceCandidate(m.candidate);
      if (peerConnection == null) {
        cachedIceCandidates.push(c);
        return;
      }
      peerConnection.addIceCandidate(c).catch(error => {
         status(`Error adding ice candidate: ${error.toString()}\n`);
      });
    } else if (m.command === 'HANGUP') {
      if (peerConnection != null) {
        peerConnection.close();
        peerConnection = null;
      }
    } else {
      status(`Received invalid command ${m.command}\n`);
    }
  };
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection();
    
  peerConnection.onicecandidate = (c) => {
    if (c.candidate != null) {
      status(`ice candidate: ${JSON.stringify(c.candidate)}\n`);
      const message = `{"command": "CANDIDATE", "to": "${peer}", "from": "${user}", "candidate": ${JSON.stringify(c.candidate)}}`;
      websocket.send(message);
    } else {
      status('null candidate\n');
    }
  }
  peerConnection.oniceconnectionstatechange = (e) => {
    status(`ice connection state: ${e.currentTarget.iceConnectionState}\n`);
  }
  peerConnection.onnegotiationneeded = (e) => {
    status('Negotiation needed\n');
  }
  peerConnection.ontrack = (t) => {
    status(`Adding remote track: ${t.track.kind}\n`);
    if (remoteVideo.scrObject !== t.streams[0]) {
      remoteVideo.srcObject = t.streams[0];
    }
  }

  setInterval(() => {
    if (peerConnection) {
      peerConnection.getStats().then(stats => {
        stats.forEach(report => {
          if (report.type === 'inbound-rtp') {
            statisticsArea.innerHTML = `Packets: ${report.packetsReceived}, bytes: ${report.bytesReceived}`;
          }
        });
      }).catch(error => {status(`Failed to get stats: ${error.toString()}\n`)
      });
    }
  }, 1000);
}

function createAnswer(desc) {
  peerConnection.setRemoteDescription(desc).then(() => {
    peerConnection.createAnswer().then(answer => {
      peerConnection.setLocalDescription(answer).then(() => {
       const message = `{"command": "ANSWER", "to": "${peer}", "from": "${user}", "desc": ${JSON.stringify(answer)}}`;
      websocket.send(message);

      // add cached ice candiatets
      cachedIceCandidates.forEach(c => peerConnection.addIceCandidate(c));
      cachedIceCandidates = [];
      }).catch(error => {
         status(`Failed to set local description: ${error.toString()}\n`);
      });
    }).catch(error => {
       status(`Failed to create answer: ${error.toString()}\n`);
    });
  }).catch(error => {
    status(`Failed to set remote description: ${error.toString()}\n`);
  });
}

function call() {
  if (!websocket) {
    status("Please connect\n")
    return;
  }
  peer = document.getElementById("peerInput").value
  if (!peer.length) {
    status("Please specify peer name\n");
    return;
  }

  status("Making call\n");

  const constraints = {audio: true, video: true};
  navigator.mediaDevices.getUserMedia(constraints).then(stream => {
    localStream = stream;

    createPeerConnection();

    localStream.getTracks().forEach(track => {
      status(`Adding local track: ${track.kind}\n`);
      peerConnection.addTrack(track, localStream);
    });

    createOffer();
  }).catch(error => {
    status(`getUserMedia error: ${error.toString()}\n`);
  });
}

function createOffer() {
  peerConnection.createOffer(offerOptions).then(offer => {
    peerConnection.setLocalDescription(offer).then(() => {
      const message = `{"command": "INVITE", "to": "${peer}", "from": "${user}", "desc": ${JSON.stringify(offer)}}`;
      websocket.send(message);
    }).catch(error => {
      status(`Failed to set local description: ${error.toString()}\n`);
    });
  }).catch(error => {
    status(`Failed to create offer: ${error.toString()}\n`);
  });
}

function hangup() {
  if (peerConnection != null) {
     const message = `{"command": "HANGUP", "to": "${peer}", "from": "${user}"}`;
     websocket.send(message);
     peerConnection.close();
     peerConnection = null;
  }
}

