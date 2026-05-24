import { Bot, Mic, SendHorizontal, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { askAgent, fetchActiveReminder, listenForSpeech, respondToActiveReminder } from '../lib/api.js';
import { listenInBrowser } from '../lib/speech.js';

const starterMessages = [
  {
    role: 'assistant',
    content: 'Ask me anything. When a reminder speaks, reply here with done, postpone, or use the mic.'
  }
];

export function ChatPanel({ onTasksChanged }) {
  const [messages, setMessages] = useState(starterMessages);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [activeReminder, setActiveReminder] = useState(null);
  const [postponeMode, setPostponeMode] = useState(false);
  const [postponeTime, setPostponeTime] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadActiveReminder() {
      try {
        const result = await fetchActiveReminder();
        if (isMounted) setActiveReminder(result.reminder);
      } catch {
        if (isMounted) setActiveReminder(null);
      }
    }

    loadActiveReminder();
    const intervalId = setInterval(loadActiveReminder, 5000);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    const content = input.trim();
    if (!content || isSending) return;

    const nextMessages = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);

    try {
      const answer = await askAgent(nextMessages);
      setMessages([...nextMessages, { role: 'assistant', content: answer.reply }]);
      if (answer.task || /marked|postponed/i.test(answer.reply || '')) {
        await onTasksChanged?.();
      }
    } catch (error) {
      setMessages([...nextMessages, { role: 'assistant', content: error.message }]);
    } finally {
      setIsSending(false);
    }
  }

  async function handleVoiceInput() {
    if (isListening) return;
    const browserResult = listenInBrowser({
      onTranscript: (transcript) => {
        if (transcript) setInput(transcript);
      }
    });

    if (!browserResult) {
      await listenWithBackend();
      return;
    }

    setIsListening(true);
    try {
      const transcript = await browserResult;
      setInput(transcript);
    } catch (error) {
      const message = String(error.message || '');
      if (/not-allowed|permission|audio-capture|no speech|no-speech/i.test(message)) {
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content: "I didn't catch that. Please try again."
          }
        ]);
      } else {
        await listenWithBackend();
      }
    } finally {
      setIsListening(false);
    }
  }

  async function listenWithBackend() {
    setIsListening(true);
    try {
      const result = await listenForSpeech();
      setInput((current) => `${current} ${result.transcript}`.trim());
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: "I didn't catch that. Please try again."
        }
      ]);
    } finally {
      setIsListening(false);
    }
  }

  async function handleReminderDone() {
    const answer = await respondToActiveReminder('done');
    setMessages((current) => [...current, { role: 'assistant', content: answer.reply }]);
    setActiveReminder(null);
    setPostponeMode(false);
    await onTasksChanged?.();
  }

  async function handleReminderPostpone(event) {
    event?.preventDefault();

    if (!postponeMode) {
      const answer = await respondToActiveReminder('postpone');
      setMessages((current) => [...current, { role: 'assistant', content: answer.reply }]);
      setPostponeMode(true);
      return;
    }

    if (!postponeTime.trim()) return;
    const answer = await respondToActiveReminder('postpone', postponeTime);
    setMessages((current) => [...current, { role: 'assistant', content: answer.reply }]);
    setActiveReminder(null);
    setPostponeMode(false);
    setPostponeTime('');
    await onTasksChanged?.();
  }

  return (
    <section className="chat-panel">
      <header>
        <div>
          <h2>Ask Agent</h2>
          <p>Your reminder assistant</p>
        </div>
        <Bot size={20} aria-hidden="true" />
      </header>

      <div className="chat-messages">
        {activeReminder && (
          <div className="active-reminder-box">
            <div>
              <strong>{activeReminder.title}</strong>
              <span>{activeReminder.is_recurring ? activeReminder.category : 'One-time'} reminder is waiting.</span>
            </div>
            {!postponeMode ? (
              <div className="active-reminder-actions">
                <button type="button" onClick={handleReminderDone}>
                  Done
                </button>
                <button type="button" onClick={handleReminderPostpone}>
                  Postpone
                </button>
              </div>
            ) : (
              <form className="postpone-form" onSubmit={handleReminderPostpone}>
                <input
                  value={postponeTime}
                  onChange={(event) => setPostponeTime(event.target.value)}
                  placeholder="after 10 minutes or 5 PM"
                  autoFocus
                />
                <button type="submit">Set</button>
              </form>
            )}
          </div>
        )}
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`chat-message chat-message--${message.role}`}>
            <span>{message.role === 'assistant' ? <Bot size={15} /> : <UserRound size={15} />}</span>
            <p>{message.content}</p>
          </div>
        ))}
      </div>

      <form className="chat-input" onSubmit={handleSubmit}>
        <button
          type="button"
          className={`mic-button ${isListening ? 'is-listening' : ''}`}
          onClick={handleVoiceInput}
          aria-label="Speak to agent"
          title={isListening ? 'Listening...' : 'Speak to agent'}
        >
          <Mic size={17} />
        </button>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={isListening ? 'Listening...' : 'Reply here: done, postpone, or ask anything'}
          aria-label="Ask reminder agent"
        />
        <button type="submit" disabled={!input.trim() || isSending} aria-label="Send question">
          <SendHorizontal size={17} />
        </button>
      </form>
    </section>
  );
}
