// Firebase modular imports
import { initializeApp } from 'firebase/app';
import { setDoc } from 'firebase/firestore';
import { getFirestore, collection, doc, addDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAMdzPP6YZPwxVYlyIXJmn8Bpv1boEK4zY",
  authDomain: "tictactoe-79830.firebaseapp.com",
  projectId: "tictactoe-79830",
  storageBucket: "tictactoe-79830.firebasestorage.app",
  messagingSenderId: "222911308322",
  appId: "1:222911308322:web:e3c940f8a6675880f4a07b",
  measurementId: "G-Q2QHVM61GK"
};

// Initialize Firebase and Firestore
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = new MediaStream();

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const hangupButton = document.getElementById('hangupButton');
const muteButton = document.getElementById('muteButton'); // Mute button for the user
const muteRemoteButton = document.getElementById('muteRemoteButton'); // Mute button for remote user
const statusMessage = document.getElementById('statusMessage'); // Element for status message

// 1. Setup media sources (audio only)
webcamButton.onclick = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true }); // Only audio
    console.log('Local stream obtained:', localStream);

    // Push tracks from local stream to peer connection
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // Pull tracks from remote stream (only audio) and add to the connection
    pc.ontrack = (event) => {
      console.log('Remote track received:', event.streams[0]);
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
    };

    // No need for video elements, as we are using audio only
    // webcamVideo.srcObject = localStream;
    // remoteVideo.srcObject = remoteStream;

    callButton.disabled = false;
    answerButton.disabled = false;
    webcamButton.disabled = true;
  } catch (error) {
    console.error('Error accessing media devices:', error);
  }
};

// 2. Create an offer
callButton.onclick = async () => {
  try {
    const callDoc = doc(collection(firestore, 'calls'));
    const offerCandidates = collection(callDoc, 'offerCandidates');
    const answerCandidates = collection(callDoc, 'answerCandidates');

    callInput.value = callDoc.id;

    // Get candidates for caller, save to db
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(offerCandidates, event.candidate.toJSON());
      }
    };

    // Create offer
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    };

    await setDoc(callDoc, { offer });

    // Listen for remote answer
    onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data();
      if (!pc.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription);
      }
    });

    // When answered, add candidate to peer connection
    onSnapshot(answerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });

    hangupButton.disabled = false;
  } catch (error) {
    console.error('Error creating offer:', error);
  }
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = doc(firestore, 'calls', callId);
  const answerCandidates = collection(callDoc, 'answerCandidates');
  const offerCandidates = collection(callDoc, 'offerCandidates');

  try {
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(answerCandidates, event.candidate.toJSON());
      }
    };

    const callData = (await getDoc(callDoc)).data();
    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };

    await updateDoc(callDoc, { answer });

    onSnapshot(offerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          let data = change.doc.data();
          pc.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  } catch (error) {
    console.error('Error answering call:', error);
  }
};

// 4. Mute the local microphone
muteButton.onclick = () => {
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !track.enabled;
  });

  if (localStream.getAudioTracks()[0].enabled) {
    muteButton.textContent = "Mute Microphone";
  } else {
    muteButton.textContent = "Unmute Microphone";
  }
};

// 5. Mute the remote user's audio
muteRemoteButton.onclick = () => {
  remoteStream.getAudioTracks().forEach(track => {
    track.enabled = !track.enabled;
  });

  if (remoteStream.getAudioTracks()[0].enabled) {
    muteRemoteButton.textContent = "Mute Remote Audio";
  } else {
    muteRemoteButton.textContent = "Unmute Remote Audio";
  }
};

// 6. Display connection status
pc.oniceconnectionstatechange = () => {
  switch (pc.iceConnectionState) {
    case 'connected':
      statusMessage.textContent = "Status: Connected to the other player!";
      break;
    case 'disconnected':
      statusMessage.textContent = "Status: Connection lost!";
      break;
    case 'failed':
      statusMessage.textContent = "Status: Connection failed!";
      break;
    default:
      statusMessage.textContent = "Status: Waiting for connection...";
  }
};
