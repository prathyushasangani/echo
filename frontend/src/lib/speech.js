const FEMALE_VOICE_HINTS = [
  'zira',
  'aria',
  'jenny',
  'susan',
  'samantha',
  'victoria',
  'karen',
  'moira',
  'tessa',
  'zira desktop',
  'female'
];

const MALE_VOICE_HINTS = ['david', 'mark', 'george', 'alex', 'daniel', 'male'];
const env = import.meta.env || {};
const API_URL = env.VITE_API_URL || (env.DEV ? 'http://localhost:4000' : '');

let currentUtterance = null;
let cachedVoices = [];
let audioContext = null;
let currentAudio = null;
let unlockedAudioElement = null;

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  cachedVoices = window.speechSynthesis.getVoices?.() || [];
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices?.() || [];
  };
}

export async function speak(text) {
  if (!text) return;
  const isIos = isIosBrowser();
  if (shouldUseServerAudio()) {
    try {
      await speakWithServerAudio(text);
      return;
    } catch {
      // Fall through to browser speech when server audio is unavailable.
    }
  }

  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.resume?.();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = getAvailableVoices();
  const preferredVoice = isIos ? null : chooseFemaleVoice(voices);

  if (preferredVoice) utterance.voice = preferredVoice;
  utterance.lang = preferredVoice?.lang || 'en-US';
  utterance.rate = isIos ? 1.08 : 1.08;
  utterance.pitch = isIos ? 1 : preferredVoice ? 1.08 : 1.18;
  utterance.volume = 1;

  return new Promise((resolve) => {
    let settled = false;
    const fallbackMs = Math.max(3500, Math.min(16000, String(text).length * 85));
    const fallbackTimer = window.setTimeout(finish, fallbackMs);
    const resumeTimer = window.setInterval(() => {
      window.speechSynthesis.resume?.();
    }, 350);

    function finish() {
      if (settled) return;
      settled = true;
      window.clearTimeout(fallbackTimer);
      window.clearInterval(resumeTimer);
      if (currentUtterance === utterance) currentUtterance = null;
      resolve();
    }

    utterance.onend = finish;
    utterance.onerror = finish;
    currentUtterance = utterance;
    window.setTimeout(() => {
      window.speechSynthesis.resume?.();
      window.speechSynthesis.speak(utterance);
    }, isIos ? 250 : 0);
    window.setTimeout(() => window.speechSynthesis.resume?.(), 80);
  });
}

export function canSpeakInBrowser() {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function shouldUseServerAudioReplies() {
  return shouldUseServerAudio();
}

export function unlockBrowserAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  audioContext ||= new AudioContext();
  audioContext.resume?.();

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  gain.gain.value = 0.0001;
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.03);

  if (!unlockedAudioElement) {
    unlockedAudioElement = new Audio();
    unlockedAudioElement.preload = 'auto';
    unlockedAudioElement.playsInline = true;
    unlockedAudioElement.crossOrigin = 'anonymous';
    unlockedAudioElement.muted = true;
    unlockedAudioElement.src =
      'data:audio/mp3;base64,SUQzAwAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjMyLjEwMAAAAAAAAAAAAAAA//uQxAADBzQASpAAAANIAAAAAExBTUUzLjk5LjVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';
    unlockedAudioElement.play().catch(() => {});
    unlockedAudioElement.pause();
    unlockedAudioElement.currentTime = 0;
    unlockedAudioElement.muted = false;
  }
}

async function speakWithServerAudio(text) {
  stopCurrentAudio();
  const response = await fetch(`${API_URL}/api/speech/speak`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader()
    },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    throw new Error('Server audio is unavailable.');
  }

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = unlockedAudioElement || new Audio();
  audio.preload = 'auto';
  audio.playsInline = true;
  audio.muted = false;
  audio.defaultPlaybackRate = 1.12;
  audio.playbackRate = 1.12;
  audio.src = audioUrl;
  currentAudio = audio;

  return new Promise((resolve, reject) => {
    let settled = false;

    function finish(error) {
      if (settled) return;
      settled = true;
      audio.pause();
      if (audio !== unlockedAudioElement) {
        audio.removeAttribute('src');
        audio.load?.();
      }
      URL.revokeObjectURL(audioUrl);
      if (currentAudio === audio) currentAudio = null;
      if (error) reject(error);
      else resolve();
    }

    audio.onended = () => finish();
    audio.onerror = () => finish(new Error('Audio playback failed.'));
    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise.catch((error) => finish(error));
    }
  });
}

function chooseFemaleVoice(voices) {
  const englishVoices = voices.filter((voice) => voice.lang?.toLowerCase().startsWith('en'));
  const candidates = englishVoices.length ? englishVoices : voices;
  const hasFemaleHint = (voice) => FEMALE_VOICE_HINTS.some((hint) => voice.name.toLowerCase().includes(hint));
  const hasMaleHint = (voice) => MALE_VOICE_HINTS.some((hint) => voice.name.toLowerCase().includes(hint));

  return (
    candidates.find(hasFemaleHint) ||
    candidates.find((voice) => !hasMaleHint(voice)) ||
    candidates[0]
  );
}

function getAvailableVoices() {
  cachedVoices = window.speechSynthesis.getVoices?.() || cachedVoices;
  return cachedVoices;
}

function isIosBrowser() {
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent) || (
    window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1
  );
}

function shouldUseServerAudio() {
  return isIosBrowser() || /Android/i.test(window.navigator.userAgent);
}

function getAuthHeader() {
  const token = window.localStorage?.getItem('echo_auth_token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function stopCurrentAudio() {
  if (!currentAudio) return;
  currentAudio.pause();
  currentAudio = null;
}

export function listenInBrowser({ onTranscript, silenceMs = 2200, maxListenMs = 15000 } = {}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  return new Promise((resolve, reject) => {
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';
    let interimTranscript = '';
    let silenceTimerId = null;
    let maxListenTimerId = null;
    let settled = false;
    let started = false;

    function clearTimers() {
      window.clearTimeout(silenceTimerId);
      window.clearTimeout(maxListenTimerId);
    }

    function currentTranscript() {
      return `${finalTranscript} ${interimTranscript}`.replace(/\s+/g, ' ').trim();
    }

    function finish() {
      if (settled) return;
      settled = true;
      clearTimers();
      stopRecognition();
      const transcript = currentTranscript();
      if (transcript) resolve(transcript);
      else reject(new Error('No speech captured.'));
    }

    function fail(message) {
      if (settled) return;
      settled = true;
      clearTimers();
      stopRecognition();
      reject(new Error(message));
    }

    function stopRecognition() {
      if (!started) return;
      try {
        recognition.stop();
      } catch {
        try {
          recognition.abort();
        } catch {
          // Chrome may throw when the recognizer is already closed.
        }
      }
    }

    function scheduleFinish() {
      window.clearTimeout(silenceTimerId);
      silenceTimerId = window.setTimeout(finish, silenceMs);
    }

    recognition.onresult = (event) => {
      interimTranscript = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript || '';
        if (result.isFinal) finalTranscript = `${finalTranscript} ${text}`.trim();
        else interimTranscript = `${interimTranscript} ${text}`.trim();
      }

      onTranscript?.(currentTranscript());
      scheduleFinish();
    };

    recognition.onstart = () => {
      started = true;
    };

    recognition.onerror = (event) => {
      if (currentTranscript()) {
        finish();
        return;
      }
      fail(event.error || 'Browser voice recognition failed.');
    };

    recognition.onend = () => {
      if (settled) return;
      const transcript = currentTranscript();
      settled = true;
      clearTimers();
      if (transcript) resolve(transcript);
      else reject(new Error('No speech captured.'));
    };

    maxListenTimerId = window.setTimeout(finish, maxListenMs);

    try {
      recognition.start();
    } catch (error) {
      fail(error.message || 'Browser voice recognition failed.');
    }
  });
}

export function startBrowserWakeListener({ onWake, onTranscript, onError } = {}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let active = true;
  let running = false;
  let paused = false;
  let restartTimerId = null;
  let lastWakeAt = 0;
  let followUpUntil = 0;
  let inactiveAfter = 0;

  function start() {
    if (!active || paused || running) return;

    try {
      recognition.start();
    } catch (error) {
      onError?.(error);
    }
  }

  function scheduleRestart() {
    window.clearTimeout(restartTimerId);
    if (!active || paused) return;
    restartTimerId = window.setTimeout(start, 450);
  }

  recognition.onstart = () => {
    running = true;
  };

  recognition.onresult = (event) => {
    let transcript = '';
    let hasFinalResult = false;

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      if (event.results[index].isFinal) hasFinalResult = true;
      transcript = `${transcript} ${event.results[index][0]?.transcript || ''}`.trim();
    }

    const normalized = normalizeWakeText(transcript);
    if (!normalized) return;

    onTranscript?.(normalized);
    if (!hasFinalResult) return;

    if (Date.now() - lastWakeAt < 4500) return;
    const wake = extractWakeCommand(normalized);
    const isFollowUp = !wake && Date.now() < followUpUntil;
    if (!wake && !isFollowUp) return;

    lastWakeAt = Date.now();
    inactiveAfter = 0;
    onWake?.(wake ? wake.command : normalized, normalized);
  };

  recognition.onerror = (event) => {
    running = false;
    if (!['no-speech', 'aborted'].includes(event.error)) {
      onError?.(new Error(event.error || 'Wake listener failed.'));
    }
  };

  recognition.onend = () => {
    running = false;
    scheduleRestart();
  };

  start();

  return {
    stop() {
      active = false;
      window.clearTimeout(restartTimerId);
      try {
        recognition.abort();
      } catch {
        // Chrome can throw if recognition is already stopped.
      }
    },
    start,
    pause() {
      paused = true;
      window.clearTimeout(restartTimerId);
      try {
        recognition.abort();
      } catch {
        // Chrome can throw if recognition is already stopped.
      }
    },
    resume() {
      paused = false;
      scheduleRestart();
    },
    armFollowUp(ms = 20000) {
      followUpUntil = Date.now() + ms;
      inactiveAfter = followUpUntil;
    },
    clearFollowUp() {
      followUpUntil = 0;
      inactiveAfter = 0;
    },
    isConversationActive() {
      return Boolean(inactiveAfter && Date.now() < inactiveAfter);
    }
  };
}

function normalizeWakeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWakeCommand(text) {
  const normalized = normalizeWakeText(text);
  const match = normalized.match(/\b(?:hey|hello|hi)?\s*(echo|eco|eko|ecko|ekko|ego|aiko|go)\b/);
  if (!match) return null;

  const command = normalized.slice(match.index + match[0].length).trim();
  return { command };
}
