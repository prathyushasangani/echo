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

export async function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = await getAvailableVoices();
  const preferredVoice = chooseFemaleVoice(voices);

  if (preferredVoice) utterance.voice = preferredVoice;
  utterance.rate = 0.92;
  utterance.pitch = preferredVoice ? 1.08 : 1.18;
  utterance.volume = 1;

  return new Promise((resolve) => {
    utterance.onend = resolve;
    utterance.onerror = resolve;
    window.speechSynthesis.speak(utterance);
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
  const voices = window.speechSynthesis.getVoices?.() || [];
  if (voices.length) return Promise.resolve(voices);

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      window.speechSynthesis.onvoiceschanged = null;
      resolve(window.speechSynthesis.getVoices?.() || []);
    }, 1200);

    window.speechSynthesis.onvoiceschanged = () => {
      window.clearTimeout(timeoutId);
      window.speechSynthesis.onvoiceschanged = null;
      resolve(window.speechSynthesis.getVoices?.() || []);
    };
  });
}

export function listenInBrowser({ onTranscript } = {}) {
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
      silenceTimerId = window.setTimeout(finish, 2200);
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

    maxListenTimerId = window.setTimeout(finish, 15_000);

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
    if (!wake) return;

    lastWakeAt = Date.now();
    onWake?.(wake.command, normalized);
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
