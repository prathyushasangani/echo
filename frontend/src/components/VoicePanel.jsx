import { Mic, Radio } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { askAgent, fetchGeminiLiveStatus, listenForSpeech } from '../lib/api.js';
import { isGeminiLiveSupported, startGeminiLiveSession } from '../lib/geminiLive.js';
import {
  canSpeakInBrowser,
  listenInBrowser,
  speak,
  startBrowserWakeListener,
  shouldUseServerAudioReplies,
  unlockBrowserAudio
} from '../lib/speech.js';

const VOICE_STATE = {
  idle: 'idle',
  wake: 'wake',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking'
};

export function VoicePanel({ onTasksChanged }) {
  const [status, setStatus] = useState('Standby');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [voiceState, setVoiceState] = useState(VOICE_STATE.idle);
  const [handsFree, setHandsFree] = useState(isGeminiLiveSupported() ? 'gemini-ready' : 'starting');
  const wakeRef = useRef(null);
  const isBusyRef = useRef(false);
  const voiceMessagesRef = useRef([]);
  const idleTimerRef = useRef(null);
  const tapPromptAtRef = useRef(0);
  const transcriptSessionRef = useRef(0);
  const geminiSessionRef = useRef(null);
  const geminiModeRef = useRef(isGeminiLiveSupported());

  useEffect(() => {
    let isMounted = true;

    async function initializeVoiceMode() {
      if (!geminiModeRef.current) {
        startHandsFree();
        return;
      }

      try {
        const liveStatus = await fetchGeminiLiveStatus();
        if (!isMounted) return;

        if (liveStatus.enabled) {
          setHandsFree('gemini-ready');
        } else {
          geminiModeRef.current = false;
          setHandsFree('starting');
          startHandsFree();
        }
      } catch {
        if (!isMounted) return;
        geminiModeRef.current = false;
        setHandsFree('starting');
        startHandsFree();
      }
    }

    initializeVoiceMode();

    return () => {
      isMounted = false;
      geminiSessionRef.current?.stop?.();
      wakeRef.current?.stop();
      wakeRef.current = null;
      window.clearTimeout(idleTimerRef.current);
    };
  }, []);

  function setInactiveSoon(ms = 20000) {
    window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      if (isBusyRef.current) return;
      wakeRef.current?.clearFollowUp?.();
      transcriptSessionRef.current += 1;
      setVoiceState(VOICE_STATE.idle);
      setStatus('Standby');
      setTranscript('');
    }, ms);
  }

  function keepConversationActive(ms = 20000) {
    wakeRef.current?.armFollowUp(ms);
    setVoiceState(VOICE_STATE.listening);
    setStatus('Listening...');
    setInactiveSoon(ms);
  }

  function startHandsFree() {
    if (wakeRef.current) return;

    const wake = startBrowserWakeListener({
      onWake: handleWakePhrase,
      onTranscript: (text) => {
        if (!isBusyRef.current && wakeRef.current?.isConversationActive?.()) {
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
    const sessionId = ++transcriptSessionRef.current;
    const browserAttempt = () =>
      listenInBrowser({
        onTranscript: (text) => {
          if (text && sessionId === transcriptSessionRef.current) setTranscript(text);
        },
        silenceMs: shouldUseServerAudioReplies() ? 1400 : 1600,
        maxListenMs: shouldUseServerAudioReplies() ? 12000 : 10000
      });

    const browserResult = browserAttempt();
    if (browserResult) {
      try {
        return await browserResult;
      } catch (error) {
        const message = String(error.message || '');
        if (/not-allowed|permission|audio-capture/i.test(message)) {
          throw error;
        }

        if (/no speech|no-speech|aborted|network/i.test(message)) {
          setStatus('Listening...');
          const retryResult = browserAttempt();
          if (retryResult) {
            return retryResult;
          }
          throw error;
        }
      }
    }

    if (shouldUseServerAudioReplies()) {
      throw new Error('Phone voice capture is not available in this browser right now.');
    }

    setStatus('Listening...');
    const backendResult = await listenForSpeech();
    return backendResult.transcript;
  }

  async function answerFromText(text, { source = 'voice' } = {}) {
    const cleanText = String(text || '').trim();
    if (!cleanText) throw new Error('No speech captured.');

    setTranscript(cleanText);
    setVoiceState(VOICE_STATE.thinking);
    setStatus('Thinking...');
    const nextMessages = [...voiceMessagesRef.current.slice(-8), { role: 'user', content: cleanText }];
    const answer = await askAgent(nextMessages, source);
    voiceMessagesRef.current = [...nextMessages, { role: 'assistant', content: answer.reply }].slice(-10);
    setReply(answer.reply);
    if (answer.shouldSpeak !== false) {
      setVoiceState(VOICE_STATE.speaking);
      setStatus('Speaking...');
      await speak(answer.reply);
    }
    if (answer.task || /marked|postponed/i.test(answer.reply || '')) {
      await onTasksChanged?.();
    }
    keepConversationActive();
  }

  async function runVoiceTurn(getText, { source = 'voice', greeting = '' } = {}) {
    if (isBusyRef.current) return;

    isBusyRef.current = true;
    window.clearTimeout(idleTimerRef.current);
    wakeRef.current?.pause();
    setVoiceState(greeting ? VOICE_STATE.speaking : VOICE_STATE.listening);
    setReply('');

    try {
      if (greeting) {
        setStatus('Speaking...');
        await speak(greeting);
      }
      setVoiceState(VOICE_STATE.listening);
      setStatus('Listening...');
      const text = await getText();
      await answerFromText(text, { source });
    } catch (error) {
      const message = canSpeakInBrowser()
        ? "I didn't catch that. Please try again."
        : 'This browser can listen, but it does not support voice replies.';
      setReply(message);
      setVoiceState(VOICE_STATE.speaking);
      await speak(message);
      setVoiceState(VOICE_STATE.idle);
      setStatus('Standby');
      setInactiveSoon(12000);
    } finally {
      isBusyRef.current = false;
      wakeRef.current?.resume();
      if (wakeRef.current) setHandsFree('on');
      if (!wakeRef.current?.isConversationActive?.()) {
        setVoiceState(VOICE_STATE.idle);
        setStatus('Standby');
        setTranscript('');
      }
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
    if (geminiModeRef.current) {
      if (geminiSessionRef.current) {
        await geminiSessionRef.current.stop();
        geminiSessionRef.current = null;
        setVoiceState(VOICE_STATE.idle);
        setStatus('Standby');
        setHandsFree('gemini-ready');
        return;
      }

      try {
        setReply('');
        setTranscript('');
        setVoiceState(VOICE_STATE.listening);
        setStatus('Connecting...');
        setHandsFree('gemini-connecting');
        geminiSessionRef.current = await startGeminiLiveSession({
          sessionId: 'voice-live',
          onStateChange: (nextState) => {
            const mappedState =
              nextState === 'speaking'
                ? VOICE_STATE.speaking
                : nextState === 'connecting'
                  ? VOICE_STATE.thinking
                  : nextState === 'idle'
                    ? VOICE_STATE.idle
                    : VOICE_STATE.listening;
            setVoiceState(mappedState);
            setStatus(
              nextState === 'speaking'
                ? 'Speaking...'
                : nextState === 'connecting'
                  ? 'Connecting...'
                  : nextState === 'idle'
                    ? 'Standby'
                    : 'Listening...'
            );
            setHandsFree(nextState === 'idle' ? 'gemini-ready' : 'gemini-live');
          },
          onTranscript: (text) => setTranscript(text),
          onReply: (text) => setReply(text),
          onTasksChanged,
          onError: async (message) => {
            geminiSessionRef.current = null;
            setHandsFree('gemini-ready');
            setVoiceState(VOICE_STATE.idle);
            setStatus('Standby');
            setReply(String(message || 'Gemini Live failed. Please tap the mic and try again.'));
          }
        });
        return;
      } catch (error) {
        geminiSessionRef.current = null;
        setHandsFree('gemini-ready');
        setVoiceState(VOICE_STATE.idle);
        setStatus('Standby');
        setReply(String(error.message || 'Gemini Live failed. Please tap the mic and try again.'));
        return;
      }
    }

    startHandsFree();
    const isMobileVoiceMode = shouldUseServerAudioReplies();
    const promptWasStarted = Date.now() - tapPromptAtRef.current < 4000;
    if (promptWasStarted && !isMobileVoiceMode) {
      await wait(900);
    }
    await runVoiceTurn(captureSpeech, {
      source: 'voice',
      greeting: isMobileVoiceMode ? '' : promptWasStarted ? '' : 'I am listening.'
    });
  }

  function handleVoicePointerDown() {
    if (isBusyRef.current) return;
    if (geminiModeRef.current) return;
    unlockBrowserAudio();
    tapPromptAtRef.current = Date.now();
    if (shouldUseServerAudioReplies()) {
      setVoiceState(VOICE_STATE.listening);
      setStatus('Listening...');
      return;
    }
    setVoiceState(VOICE_STATE.speaking);
    setStatus('Speaking...');
    speak('I am listening.');
  }

  const isConversationListening = voiceState === VOICE_STATE.listening;
  const showWakeArmed = handsFree === 'on' && voiceState === VOICE_STATE.idle;
  const showAnimatedWaves = voiceState !== VOICE_STATE.idle;

  return (
    <section className={`voice-panel ${isConversationListening ? 'is-listening' : ''} ${showWakeArmed ? 'is-hands-free' : ''} ${showAnimatedWaves ? 'is-active-wave' : ''}`}>
      <div className="voice-orb-wrap">
        <button
          type="button"
          className="voice-orb"
          onPointerDown={handleVoicePointerDown}
          onClick={handleSpeak}
          aria-label={geminiSessionRef.current ? 'Stop realtime Echo' : 'Speak with Echo'}
        >
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
          {handsFree === 'gemini-ready' && 'Realtime Gemini voice is ready. Tap the mic to start a live conversation.'}
          {handsFree === 'gemini-connecting' && 'Connecting to Gemini Live...'}
          {handsFree === 'gemini-live' && 'Realtime conversation is active. Tap the mic again to stop.'}
          {handsFree === 'on' && (isConversationListening ? 'Conversation is active. Speak your next command.' : 'Wake mode is ready. Say hello Echo to start.')}
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

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
