// Jackie AI Assistant - Voice Interaction System
// Connects to Mohan's deployed voice assistant backend

// Global variables
let talkBtn, terminateBtn;
let mobileTalkBtn, mobileTerminateBtn, mobileFloatingBtn, mobileModal, mobileModalClose;
let isRecording = false;
let isProcessing = false;
let isSpeaking = false;
let mediaRecorder = null;
let audioChunks = [];
let currentAudio = null;
let websocket = null;
let hasGreeted = false;
let localMode = false;
let recognition = null;
let isMobile = false;



// Voice Assistant Configuration
const BACKEND_URL = 'https://mohan-this-side--mohan-voice-assistant-latest-fastapi-app.modal.run';

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function () {
  setTimeout(initializeJackieWithRetry, 500);
});

function initializeJackieWithRetry() {
  // Detect if we're on mobile
  isMobile = window.innerWidth <= 767;
  
  // Ensure Jackie sidebar is expanded and handle its button
  const jackieSidebar = document.querySelector('.sidebar.jackie-sidebar');
  if (jackieSidebar) {
    jackieSidebar.classList.add('active');
    
    // Also handle the Jackie sidebar button
    const jackieSidebarBtn = jackieSidebar.querySelector('[data-sidebar-btn]');
    if (jackieSidebarBtn) {
      jackieSidebarBtn.addEventListener('click', function(e) {
        e.preventDefault();
        jackieSidebar.classList.toggle('active');
      });
    }
  }
  
  // Get desktop elements
  talkBtn = document.getElementById('jackieTalkBtn');
  terminateBtn = document.getElementById('jackieTerminateBtn');
  
  // Get mobile elements
  mobileTalkBtn = document.getElementById('mobileJackieTalkBtn');
  mobileTerminateBtn = document.getElementById('mobileJackieTerminateBtn');
  mobileFloatingBtn = document.getElementById('mobileJackieBtn');
  mobileModal = document.getElementById('jackieModalOverlay');
  mobileModalClose = document.getElementById('jackieModalClose');
  
  // Check if required elements exist (either desktop or mobile)
  const hasDesktopElements = talkBtn && terminateBtn;
  const hasMobileElements = mobileTalkBtn && mobileTerminateBtn && mobileFloatingBtn;
  
  if (!hasDesktopElements && !hasMobileElements) {
    setTimeout(initializeJackieWithRetry, 1000);
    return;
  }
  
  setupEventListeners();
  initializeJackie();
}

// Setup event listeners
function setupEventListeners() {
  // Desktop event listeners
  if (talkBtn) {
    talkBtn.addEventListener('click', toggleTalk);
  }
  
  if (terminateBtn) {
    terminateBtn.addEventListener('click', stopCurrentAudio);
  }

  // Mobile event listeners
  if (mobileTalkBtn) {
    mobileTalkBtn.addEventListener('click', toggleTalk);
  }
  
  if (mobileTerminateBtn) {
    mobileTerminateBtn.addEventListener('click', stopCurrentAudio);
  }

  if (mobileFloatingBtn) {
    mobileFloatingBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      openMobileModal();
    });
  }

  if (mobileModalClose) {
    mobileModalClose.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('Modal close button clicked');
      closeMobileModal();
    });
  }

  if (mobileModal) {
    mobileModal.addEventListener('click', function(e) {
      if (e.target === mobileModal) {
        e.preventDefault();
        e.stopPropagation();
        closeMobileModal();
      }
    });
  }

  // Handle window resize for mobile detection
  window.addEventListener('resize', function() {
    isMobile = window.innerWidth <= 767;
  });

  // Keyboard shortcuts (only for desktop)
  document.addEventListener('keydown', function(e) {
    if (!isMobile) {
      if (e.code === 'Space' && !isRecording && !isProcessing) {
        e.preventDefault();
        toggleTalk();
      }
      
      if (e.code === 'Escape' && isSpeaking) {
        e.preventDefault();
        stopCurrentAudio();
      }
    }
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', function() {
    if (websocket) {
      websocket.close();
    }
    stopCurrentAudio();
  });
}

// Initialize voice assistant
function initializeJackie() {
  updateButtons();
  updateStatus('🤖 JACKIE SYSTEMS ONLINE - Connecting...', 'active');
  
  // Try to connect to backend
  connectWebSocket();
  
  // Fallback to local mode after 3 seconds
  setTimeout(() => {
    if (!localMode && (!websocket || websocket.readyState !== WebSocket.OPEN)) {
      updateStatus('🔄 ENABLING LOCAL MODE - Click Talk to test', 'active');
      enableLocalMode();
    }
  }, 3000);
}

// Connect to WebSocket
function connectWebSocket() {
  try {
    const wsUrl = BACKEND_URL.replace('https://', 'wss://') + '/ws';
    console.log('Connecting to WebSocket:', wsUrl);
    
    websocket = new WebSocket(wsUrl);
    
    const connectionTimeout = setTimeout(() => {
      if (websocket.readyState !== WebSocket.OPEN) {
        console.log('WebSocket connection timeout, switching to local mode');
        websocket.close();
        enableLocalMode();
      }
    }, 5000);
    
    websocket.onopen = function() {
      console.log('WebSocket connected successfully');
      clearTimeout(connectionTimeout);
      updateStatus('🔗 NEURAL LINK ESTABLISHED - Jackie is ready', 'success');
      
      if (!hasGreeted) {
        setTimeout(() => {
          playGreeting();
          hasGreeted = true;
        }, 1000);
      }
    };
    
    websocket.onmessage = function(event) {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };
    
    websocket.onclose = function() {
      console.log('WebSocket connection closed');
      clearTimeout(connectionTimeout);
      if (!localMode) {
        updateStatus('⚠️ CONNECTION LOST - Switching to local mode...', 'error');
        setTimeout(() => enableLocalMode(), 1000);
      }
    };
    
    websocket.onerror = function(error) {
      console.error('WebSocket error:', error);
      clearTimeout(connectionTimeout);
      updateStatus('❌ CONNECTION ERROR - Switching to local mode', 'error');
      setTimeout(() => enableLocalMode(), 1000);
    };
    
  } catch (error) {
    console.error('Failed to connect WebSocket:', error);
    updateStatus('❌ BACKEND OFFLINE - Using local voice mode', 'error');
    enableLocalMode();
  }
}

// Handle WebSocket messages
function handleWebSocketMessage(data) {
  console.log('Received message:', data.type);
  
  switch (data.type) {
    case 'transcription':
      if (data.text) {
        console.log('User said:', data.text);
        updateStatus(`🎯 PROCESSED: "${data.text}"`, 'active');
      }
      break;
      
    case 'response':
      console.log('Jackie response:', data.text);
      if (data.audio) {
        playAudio(data.audio);
      } else {
        updateStatus('📝 RESPONSE READY - No audio available');
        isProcessing = false;
        updateButtons();
      }
      break;
      
    default:
      console.log('Unknown message type:', data.type);
  }
}

// Play initial greeting
function playGreeting() {
  updateStatus('👋 JACKIE GREETING...', 'active');
  
  const greetingText = "Hi there! Jackie this side. Mohan's Professional AI Assistant. How can I help you today?";
  
  if ('speechSynthesis' in window) {
    const speakGreeting = () => {
      const utterance = new SpeechSynthesisUtterance(greetingText);
      utterance.rate = 1.2;
      utterance.pitch = 1.1;
      utterance.volume = 0.6;
      
      const voices = speechSynthesis.getVoices();
      const femaleVoice = voices.find(voice => 
        voice.name.toLowerCase().includes('female') || 
        voice.name.toLowerCase().includes('woman') ||
        voice.name.toLowerCase().includes('samantha') ||
        voice.name.toLowerCase().includes('alex') ||
        voice.name.toLowerCase().includes('karen')
      );
      
      if (femaleVoice) {
        utterance.voice = femaleVoice;
      }
      
      utterance.onstart = function() {
        isSpeaking = true;
        updateButtons();
        updateStatus('🔊 JACKIE GREETING - Welcome to the portfolio', 'active');
      };
      
      utterance.onend = function() {
        isSpeaking = false;
        updateButtons();
        updateStatus('✅ GREETING COMPLETE - Ready for voice interaction', 'success');
      };
      
      utterance.onerror = function(e) {
        console.error('Speech synthesis error:', e);
        isSpeaking = false;
        updateButtons();
        updateStatus('✅ JACKIE READY - Click Talk to interact', 'success');
      };
      
      speechSynthesis.speak(utterance);
    };
    
    if (speechSynthesis.getVoices().length > 0) {
      speakGreeting();
    } else {
      speechSynthesis.addEventListener('voiceschanged', speakGreeting, { once: true });
      setTimeout(() => {
        if (!isSpeaking) {
          speakGreeting();
        }
      }, 1000);
    }
  } else {
    updateStatus('✅ JACKIE READY - Voice synthesis not available', 'success');
  }
}

// Toggle voice recording
async function toggleTalk() {
  // Always stop current audio first when user clicks Talk
  if (isSpeaking || currentAudio) {
    stopCurrentAudio();
    // Give a moment for audio to stop before starting recording
    setTimeout(async () => {
      await startRecording();
    }, 100);
    return;
  }
  
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

// Start voice recording
async function startRecording() {
  
  if (localMode && recognition) {
    try {
      updateStatus('🎤 LOCAL RECOGNITION STARTING...', 'active');
      isRecording = true;
      updateButtons();
      recognition.start();
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      updateStatus('❌ SPEECH RECOGNITION ERROR - Try again', 'error');
      isRecording = false;
      updateButtons();
    }
    return;
  }
  
  // Backend recording mode
  try {
    updateStatus('🎤 REQUESTING MICROPHONE ACCESS...', 'active');
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });
    
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });
    
    mediaRecorder.ondataavailable = function(event) {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = function() {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
      sendAudioToBackend(audioBlob);
      stream.getTracks().forEach(track => track.stop());
    };
    
    mediaRecorder.start();
    isRecording = true;
    updateButtons();
    updateStatus('🔴 RECORDING ACTIVE - Speak now...', 'active');
    
  } catch (error) {
    console.error('Failed to start recording:', error);
    updateStatus('❌ MICROPHONE ACCESS DENIED - Please allow microphone', 'error');
    isRecording = false;
    updateButtons();
  }
}

// Stop voice recording
function stopRecording() {
  if (localMode && recognition && isRecording) {
    recognition.stop();
    isRecording = false;
    isProcessing = true;
    updateButtons();
    updateStatus('⚡ PROCESSING LOCAL SPEECH...', 'active');
    return;
  }
  
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    isProcessing = true;
    updateButtons();
    updateStatus('⚡ PROCESSING NEURAL PATTERNS...', 'active');
  }
}

// Send audio to backend
function sendAudioToBackend(audioBlob) {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    updateStatus('❌ CONNECTION ERROR - Please refresh page', 'error');
    isProcessing = false;
    updateButtons();
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function() {
    const base64Audio = reader.result.split(',')[1];
    
    websocket.send(JSON.stringify({
      type: 'audio',
      data: base64Audio,
      mimeType: audioBlob.type,
      size: audioBlob.size
    }));
    
    updateStatus('📡 TRANSMITTING TO JACKIE...', 'active');
  };
  
  reader.readAsDataURL(audioBlob);
}

// Play audio response
function playAudio(base64Audio) {
  try {
    stopCurrentAudio();
    
    currentAudio = new Audio(`data:audio/wav;base64,${base64Audio}`);
    isSpeaking = true;
    isProcessing = false;
    updateButtons();
    updateStatus('🔊 JACKIE RESPONDING - Click TERMINATE to interrupt', 'active');
    
    currentAudio.onended = function() {
      currentAudio = null;
      isSpeaking = false;
      updateButtons();
      updateStatus('✅ RESPONSE COMPLETE - Ready for next query', 'success');
    };
    
    currentAudio.onerror = function(e) {
      console.error('Audio play error:', e);
      currentAudio = null;
      isSpeaking = false;
      isProcessing = false;
      updateButtons();
      updateStatus('❌ AUDIO ERROR - Ready to try again', 'error');
    };
    
    currentAudio.play().catch(e => {
      console.error('Audio play failed:', e);
      currentAudio = null;
      isSpeaking = false;
      isProcessing = false;
      updateButtons();
      updateStatus('❌ PLAYBACK FAILED - Ready to try again', 'error');
    });
    
  } catch (error) {
    console.error('Audio creation failed:', error);
    isProcessing = false;
    updateButtons();
    updateStatus('❌ AUDIO SYSTEM ERROR - Ready to try again', 'error');
  }
}

// Stop current audio
function stopCurrentAudio() {
  // Stop audio element playback
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  
  // Stop browser speech synthesis
  if ('speechSynthesis' in window && speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }
  
  // Stop any ongoing recording
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  
  // Stop speech recognition
  if (recognition && isRecording) {
    recognition.stop();
  }
  
  // Reset all states
  isSpeaking = false;
  isRecording = false;
  isProcessing = false;
  
  updateButtons();
  updateStatus('🛑 INTERRUPTED - Ready for your question', 'success');
}

// Enable local-only mode
function enableLocalMode() {
  localMode = true;
  updateStatus('💻 LOCAL MODE ACTIVE - Limited functionality', 'active');
  
  if (!hasGreeted) {
    setTimeout(() => {
      playGreeting();
      hasGreeted = true;
    }, 1000);
  }
  
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onresult = function(event) {
      const transcript = event.results[0][0].transcript;
      console.log('Local recognition:', transcript);
      updateStatus(`🎯 YOU SAID: "${transcript}"`, 'active');
      generateLocalResponse(transcript);
    };
    
    recognition.onerror = function(event) {
      console.error('Speech recognition error:', event.error);
      updateStatus('❌ SPEECH RECOGNITION ERROR - Try again', 'error');
      isRecording = false;
      isProcessing = false;
      updateButtons();
    };
    
    recognition.onend = function() {
      isRecording = false;
      if (!isProcessing) {
        updateButtons();
      }
    };
    
    updateStatus('🎤 LOCAL VOICE READY - Click Talk to speak', 'success');
  } else {
    updateStatus('❌ VOICE NOT SUPPORTED - Please try a modern browser', 'error');
  }
}

// Generate local response
function generateLocalResponse(userText) {
  isProcessing = true;
  updateButtons();
  updateStatus('💭 GENERATING LOCAL RESPONSE...', 'active');
  
  let response = "I'm currently in local mode with limited functionality. ";
  
  const text = userText.toLowerCase();
  if (text.includes('experience') || text.includes('work')) {
    response += "Mohan has over 3 years of data science experience, currently working at Cohere Health and previously at Mediamint and Allround Club.";
  } else if (text.includes('skill') || text.includes('technology')) {
    response += "Mohan specializes in Python, Machine Learning, PySpark, TensorFlow, AWS, and healthcare data science.";
  } else if (text.includes('education') || text.includes('study')) {
    response += "Mohan is pursuing a Master's in Data Science at Northeastern University, expected to graduate in December 2025.";
  } else if (text.includes('project')) {
    response += "Mohan has worked on predictive modeling, recommendation systems, customer segmentation, and real-time data pipelines.";
  } else {
    response += "For detailed information about Mohan's background, please try when the full backend is available, or check his portfolio sections.";
  }
  
  setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(response);
    utterance.rate = 0.9;
    utterance.pitch = 1.1;
    utterance.volume = 0.8;
    
    utterance.onstart = function() {
      isProcessing = false;
      isSpeaking = true;
      updateButtons();
      updateStatus('🔊 LOCAL RESPONSE - Limited mode active', 'active');
    };
    
    utterance.onend = function() {
      isSpeaking = false;
      updateButtons();
      updateStatus('✅ LOCAL RESPONSE COMPLETE - Try again', 'success');
    };
    
    speechSynthesis.speak(utterance);
  }, 1000);
}

// Mobile modal functions
function openMobileModal() {
  console.log('Opening mobile modal');
  if (mobileModal) {
    mobileModal.style.display = 'flex';
    setTimeout(() => {
      mobileModal.classList.add('active');
    }, 10);
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  }
}

function closeMobileModal() {
  console.log('Closing mobile modal');
  if (mobileModal) {
    mobileModal.classList.remove('active');
    setTimeout(() => {
      mobileModal.style.display = 'none';
    }, 300); // Wait for animation to complete
    document.body.style.overflow = ''; // Restore scrolling
  }
}

// Update button states
function updateButtons() {
  // Update desktop buttons
  if (talkBtn && terminateBtn) {
    if (isRecording) {
      talkBtn.textContent = '🔴 Stop';
      talkBtn.classList.add('recording');
      talkBtn.disabled = false;
      terminateBtn.disabled = true;
    } else if (isProcessing) {
      talkBtn.textContent = '⚡ Processing...';
      talkBtn.classList.remove('recording');
      talkBtn.disabled = true;
      terminateBtn.disabled = true;
    } else if (isSpeaking) {
      talkBtn.textContent = '🎤 Interrupt & Talk';
      talkBtn.classList.remove('recording');
      talkBtn.disabled = false;
      terminateBtn.disabled = false;
    } else {
      talkBtn.textContent = 'Talk';
      talkBtn.classList.remove('recording');
      talkBtn.disabled = false;
      terminateBtn.disabled = true;
    }
  }

  // Update mobile buttons
  if (mobileTalkBtn && mobileTerminateBtn) {
    if (isRecording) {
      mobileTalkBtn.textContent = '🔴 Stop';
      mobileTalkBtn.classList.add('recording');
      mobileTalkBtn.disabled = false;
      mobileTerminateBtn.disabled = true;
    } else if (isProcessing) {
      mobileTalkBtn.textContent = '⚡ Processing...';
      mobileTalkBtn.classList.remove('recording');
      mobileTalkBtn.disabled = true;
      mobileTerminateBtn.disabled = true;
    } else if (isSpeaking) {
      mobileTalkBtn.textContent = '🎤 Interrupt & Talk';
      mobileTalkBtn.classList.remove('recording');
      mobileTalkBtn.disabled = false;
      mobileTerminateBtn.disabled = false;
    } else {
      mobileTalkBtn.textContent = 'Talk';
      mobileTalkBtn.classList.remove('recording');
      mobileTalkBtn.disabled = false;
      mobileTerminateBtn.disabled = true;
    }
  }

  // Update floating button state (fixed flickering)
  if (mobileFloatingBtn) {
    // Remove all state classes first
    mobileFloatingBtn.classList.remove('recording', 'processing', 'speaking');
    
    if (isRecording) {
      mobileFloatingBtn.classList.add('recording');
    } else if (isProcessing) {
      mobileFloatingBtn.classList.add('processing');
    } else if (isSpeaking) {
      mobileFloatingBtn.classList.add('speaking');
    }
  }
}

// Update status display
function updateStatus(message, type = 'normal') {
  console.log('Jackie Status:', message);
  
  // Update desktop status
  const statusElement = document.getElementById('jackieStatus');
  if (statusElement) {
    statusElement.textContent = message;
    
    statusElement.classList.remove('active', 'error', 'success');
    
    switch (type) {
      case 'active':
        statusElement.classList.add('active');
        break;
      case 'error':
        statusElement.classList.add('error');
        break;
      case 'success':
        statusElement.classList.add('success');
        break;
    }
  }
  
  // Update mobile status
  const mobileStatusElement = document.getElementById('mobileJackieStatus');
  if (mobileStatusElement) {
    mobileStatusElement.textContent = message;
    
    mobileStatusElement.classList.remove('active', 'error', 'success');
    
    switch (type) {
      case 'active':
        mobileStatusElement.classList.add('active');
        break;
      case 'error':
        mobileStatusElement.classList.add('error');
        break;
      case 'success':
        mobileStatusElement.classList.add('success');
        break;
    }
  }
}

// Add enhanced styles for voice interaction
const style = document.createElement('style');
style.innerHTML = `
  .jackie-btn.recording {
    background: #ff4444 !important;
    border-color: #ff4444 !important;
    color: white !important;
    animation: pulse 1.5s infinite;
  }
  
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(255, 68, 68, 0.7); }
    70% { box-shadow: 0 0 0 10px rgba(255, 68, 68, 0); }
    100% { box-shadow: 0 0 0 0 rgba(255, 68, 68, 0); }
  }
  
  .jackie-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .sidebar.jackie-sidebar:hover {
    background: rgba(103, 102, 102, 0.08);
    transition: background 0.3s ease;
  }
`;
document.head.appendChild(style); 