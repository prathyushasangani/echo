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
  window.speechSynthesis.speak(utterance);
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
