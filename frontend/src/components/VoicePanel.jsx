import { Mic, Radio } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { askAgent, listenForSpeech } from '../lib/api.js';
import { listenInBrowser, speak, startBrowserWakeListener } from '../lib/speech.js';

export function VoicePanel({ onTasksChanged }) {
  const [status, setStatus] = useState('Tap to speak with Echo');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [handsFree, setHandsFree] = useState('starting');
  const wakeRef = useRef(null);
  const isBusyRef = useRef(false);
  const voiceMessagesRef = useRef([]);

  useEffect(() => {
    startHandsFree();

    return () => {
      wakeRef.current?.stop();
      wakeRef.current = null;
    };
  }, []);

  function startHandsFree() {
    if (wakeRef.current) return;

    const wake = startBrowserWakeListener({
      onWake: handleWakePhrase,
      onTranscript: (text) => {
        if (!isBusyRef.current) {
          setTranscript(text);
        }
      },
      onError: () => {
        setHandsFree('needs-click');
      }
    });

    if (!wake) {
      setHandsFree('unsupported');
      return;
    }

    wakeRef.current = wake;
    setHandsFree('on');
  }

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

  async function answerFromText(text, { source = 'voice' } = {}) {
    const cleanText = String(text || '').trim();
    if (!cleanText) throw new Error('No speech captured.');

    setTranscript(cleanText);
    setStatus('Thinking...');
    const nextMessages = [...voiceMessagesRef.current.slice(-8), { role: 'user', content: cleanText }];
    const answer = await askAgent(nextMessages, source);
    voiceMessagesRef.current = [...nextMessages, { role: 'assistant', content: answer.reply }].slice(-10);
    setReply(answer.reply);
    if (answer.shouldSpeak !== false) {
      await speak(answer.reply);
    }
    if (answer.task || /marked|postponed/i.test(answer.reply || '')) {
      await onTasksChanged?.();
    }
    setStatus('Tap to speak again');
  }

  async function runVoiceTurn(getText, { source = 'voice', greeting = '' } = {}) {
    if (isBusyRef.current) return;

    isBusyRef.current = true;
    wakeRef.current?.pause();
    window.speechSynthesis?.cancel?.();
    setIsListening(true);
    setReply('');

    try {
      if (greeting) {
        setStatus('Listening...');
        await speak(greeting);
      }
      const text = await getText();
      await answerFromText(text, { source });
    } catch (error) {
      const message = "I didn't catch that. Please try again.";
      setReply(message);
      setStatus('Tap to retry');
    } finally {
      setIsListening(false);
      isBusyRef.current = false;
      wakeRef.current?.resume();
      if (wakeRef.current) setHandsFree('on');
      wakeRef.current?.armFollowUp();
    }
  }

  async function handleWakePhrase(command) {
    const inlineCommand = String(command || '').trim();

    if (inlineCommand) {
      await runVoiceTurn(() => Promise.resolve(inlineCommand), {
        source: 'hands-free',
        greeting: ''
      });
      return;
    }

    await runVoiceTurn(captureSpeech, {
      source: 'hands-free',
      greeting: 'Hello, I am listening.'
    });
  }

  async function handleSpeak() {
    startHandsFree();
    await runVoiceTurn(captureSpeech);
  }

  return (
    <section className={`voice-panel ${isListening ? 'is-listening' : ''} ${handsFree === 'on' ? 'is-hands-free' : ''}`}>
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
        <p className="voice-mode">
          {handsFree === 'on' && 'Hands-free is listening for hey Echo.'}
          {handsFree === 'starting' && 'Starting hands-free listening...'}
          {handsFree === 'needs-click' && 'Tap the mic once to enable hands-free listening.'}
          {handsFree === 'unsupported' && 'Hands-free listening is not supported in this browser.'}
        </p>
        {transcript && <p className="voice-transcript">You: {transcript}</p>}
        {reply && <p className="voice-reply">Echo: {reply}</p>}
      </div>
    </section>
  );
}
