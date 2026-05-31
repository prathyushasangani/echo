import { Bot, SendHorizontal, UserRound } from 'lucide-react';
import { useState } from 'react';
import { askAgent } from '../lib/api.js';

const starterMessages = [
  {
    role: 'assistant',
    content: 'Type here anytime if you want to chat instead of speaking.'
  }
];

export function InlineChatPanel({ onTasksChanged }) {
  const [messages, setMessages] = useState(starterMessages);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const content = input.trim();
    if (!content || isSending) return;

    const nextMessages = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);

    try {
      const answer = await askAgent(nextMessages, 'inline-chat');
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

  const previewMessages = messages.slice(-4);

  return (
    <section className="inline-chat-panel">
      <header>
        <div>
          <h2>Chat with Echo</h2>
          <p>Type here when you don&apos;t want to use voice.</p>
        </div>
        <Bot size={18} aria-hidden="true" />
      </header>

      <div className="inline-chat-messages">
        {previewMessages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`chat-message chat-message--${message.role}`}>
            <span>{message.role === 'assistant' ? <Bot size={15} /> : <UserRound size={15} />}</span>
            <p>{message.content}</p>
          </div>
        ))}
      </div>

      <form className="chat-input inline-chat-input" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type hi, ask a question, or give a reminder command"
          aria-label="Chat with Echo"
        />
        <button type="submit" disabled={!input.trim() || isSending} aria-label="Send message">
          <SendHorizontal size={17} />
        </button>
      </form>
    </section>
  );
}
