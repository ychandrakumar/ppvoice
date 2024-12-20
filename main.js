// Firebase modular imports
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, addDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { setDoc } from 'firebase/firestore';

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
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// Mute buttons
const muteButton = document.getElementById('muteButton'); // Mute local microphone
const muteRemoteButton = document.getElementById('muteRemoteButton'); // Mute incoming audio

let isLocalMuted = false; // Track local mute state
let isRemoteMuted = false; // Track remote mute state

// 1. Setup media sources
webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
  // Reference Firestore collections for signaling
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
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = doc(firestore, 'calls', callId);
  const answerCandidates = collection(callDoc, 'answerCandidates');
  const offerCandidates = collection(callDoc, 'offerCandidates');

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
};

// 4. Mute Local Audio (Microphone)
muteButton.onclick = () => {
  isLocalMuted = !isLocalMuted;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !isLocalMuted; // Mute/unmute the local track
  });
  muteButton.textContent = isLocalMuted ? 'Unmute Microphone' : 'Mute Microphone'; // Update button text
};

// 5. Mute Remote Audio (Incoming Audio)
muteRemoteButton.onclick = () => {
  isRemoteMuted = !isRemoteMuted;
  remoteStream.getAudioTracks().forEach((track) => {
    track.enabled = !isRemoteMuted; // Mute/unmute the remote track
  });
  muteRemoteButton.textContent = isRemoteMuted ? 'Unmute Remote Audio' : 'Mute Remote Audio'; // Update button text
};
