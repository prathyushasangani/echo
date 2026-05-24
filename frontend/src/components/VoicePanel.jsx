import { Mic, Radio } from 'lucide-react';
import { useState } from 'react';
import { askAgent, listenForSpeech } from '../lib/api.js';
import { listenInBrowser, speak } from '../lib/speech.js';

export function VoicePanel({ onTasksChanged }) {
  const [status, setStatus] = useState('Tap to speak with Echo');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [isListening, setIsListening] = useState(false);

  async function captureSpeech() {
    const browserResult = listenInBrowser({
      onTranscript: (text) => {
        if (text) setTranscript(text);
      }
    });

    if (browserResult) {
      try {
        return await browserResult;
      } catch (error) {
        const message = String(error.message || '');
        if (/not-allowed|permission|audio-capture|no speech|no-speech/i.test(message)) {
          throw error;
        }
      }
    }

    setStatus('Listening...');
    const backendResult = await listenForSpeech();
    return backendResult.transcript;
  }

  async function handleSpeak() {
    if (isListening) return;

    window.speechSynthesis?.cancel?.();
    setIsListening(true);
    setStatus('Listening...');
    setTranscript('');
    setReply('');

    try {
      const text = await captureSpeech();
      setTranscript(text);
      setStatus('Thinking...');
      const answer = await askAgent([{ role: 'user', content: text }], 'voice');
      setReply(answer.reply);
      if (answer.shouldSpeak !== false) {
        speak(answer.reply);
      }
      if (answer.task || /marked|postponed/i.test(answer.reply || '')) {
        await onTasksChanged?.();
      }
      setStatus('Tap to speak again');
    } catch (error) {
      const message = "I didn't catch that. Please try again.";
      setReply(message);
      setStatus('Tap to retry');
    } finally {
      setIsListening(false);
    }
  }

  return (
    <section className={`voice-panel ${isListening ? 'is-listening' : ''}`}>
      <div className="voice-orb-wrap">
        <button type="button" className="voice-orb" onClick={handleSpeak} aria-label="Speak with Echo">
          <Mic size={34} aria-hidden="true" />
        </button>
      </div>
      <div>
        <p className="voice-kicker">
          <Radio size={14} aria-hidden="true" />
          Echo Voice
        </p>
        <h2>{status}</h2>
        {transcript && <p className="voice-transcript">You: {transcript}</p>}
        {reply && <p className="voice-reply">Echo: {reply}</p>}
      </div>
    </section>
  );
}
