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
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const hangupButton = document.getElementById('hangupButton');
const muteButton = document.getElementById('muteButton');
const muteRemoteButton = document.getElementById('muteRemoteButton');
const statusMessage = document.getElementById('statusMessage');

// 1. Setup media sources
webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true, // Enable echo cancellation
      noiseSuppression: true,  // Enable noise suppression
      autoGainControl: true,   // Enable auto gain control
    }
  });

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

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
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

// Mute microphone functionality
muteButton.onclick = () => {
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack.enabled) {
    audioTrack.enabled = false;
    muteButton.textContent = 'Unmute Microphone';
  } else {
    audioTrack.enabled = true;
    muteButton.textContent = 'Mute Microphone';
  }
};

// Mute remote audio functionality
muteRemoteButton.onclick = () => {
  const remoteAudioTrack = remoteStream.getAudioTracks()[0];
  if (remoteAudioTrack.enabled) {
    remoteAudioTrack.enabled = false;
    muteRemoteButton.textContent = 'Unmute Remote Audio';
  } else {
    remoteAudioTrack.enabled = true;
    muteRemoteButton.textContent = 'Mute Remote Audio';
  }
};

// Hangup functionality
hangupButton.onclick = () => {
  pc.close();
  pc.onicecandidate = null;
  localStream.getTracks().forEach(track => track.stop());
  remoteStream.getTracks().forEach(track => track.stop());
  hangupButton.disabled = true;
  statusMessage.textContent = 'Status: Call ended';
};
