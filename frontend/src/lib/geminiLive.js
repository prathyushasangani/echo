import { GoogleGenAI, Modality, Type } from '@google/genai';
import { askAgent, createGeminiLiveToken } from './api.js';

const TOOL_NAME = 'run_reminder_agent';
const TOOL_DECLARATION = {
  name: TOOL_NAME,
  description:
    'Use this for anything about reminders, routines, due times, categories, schedules, or task changes. Pass the latest user message exactly as spoken.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      message: {
        type: Type.STRING,
        description: 'The latest user message or command.'
      },
      sessionId: {
        type: Type.STRING,
        description: 'Optional session id for the reminder agent.'
      }
    },
    required: ['message']
  }
};

export function isGeminiLiveSupported() {
  return Boolean(
    typeof window !== 'undefined' &&
      window.MediaRecorder &&
      window.navigator?.mediaDevices?.getUserMedia &&
      window.AudioContext
  );
}

export async function startGeminiLiveSession({
  sessionId = 'voice-live',
  onStateChange,
  onTranscript,
  onReply,
  onError,
  onTasksChanged
} = {}) {
  if (!isGeminiLiveSupported()) {
    throw new Error('This browser does not support Gemini Live audio.');
  }

  onStateChange?.('connecting');
  const mediaStream = await window.navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1
    }
  });

  const tokenInfo = await createGeminiLiveToken();
  const ai = new GoogleGenAI({
    apiKey: tokenInfo.token,
    apiVersion: 'v1alpha'
  });

  const audioQueue = new PcmAudioQueue();
  await audioQueue.resume();

  let session = null;
  let isClosed = false;
  let pendingReply = '';
  let inputCapture = null;

  const closeEverything = async () => {
    if (isClosed) return;
    isClosed = true;

    inputCapture?.stop();
    mediaStream?.getTracks().forEach((track) => track.stop());
    inputCapture = null;
    mediaStream = null;
    audioQueue.stop();
    session?.close();
    session = null;
    onStateChange?.('idle');
  };

  session = await ai.live.connect({
    model: tokenInfo.model,
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: tokenInfo.voice || 'Kore'
          }
        }
      },
      tools: [
        {
          functionDeclarations: [TOOL_DECLARATION]
        }
      ]
    },
    callbacks: {
      onopen: () => {
        onStateChange?.('listening');
      },
      onmessage: async (message) => {
        if (message.serverContent?.interrupted) {
          pendingReply = '';
          audioQueue.clear();
        }

        if (message.serverContent?.inputTranscription?.text) {
          onTranscript?.(message.serverContent.inputTranscription.text);
        }

        if (message.serverContent?.outputTranscription?.text) {
          pendingReply = message.serverContent.outputTranscription.text;
          onReply?.(pendingReply);
          onStateChange?.('speaking');
        }

        const parts = message.serverContent?.modelTurn?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            await audioQueue.enqueue(part.inlineData.data, part.inlineData.mimeType || 'audio/pcm;rate=24000');
          }
          if (part.text) {
            pendingReply = `${pendingReply} ${part.text}`.trim();
            onReply?.(pendingReply);
          }
        }

        if (message.serverContent?.waitingForInput) {
          onStateChange?.('listening');
        }

        if (message.serverContent?.turnComplete) {
          onStateChange?.('listening');
        }

        if (message.toolCall?.functionCalls?.length) {
          const functionResponses = [];
          for (const call of message.toolCall.functionCalls) {
            if (call.name !== TOOL_NAME) continue;
            try {
              const toolMessage = String(call.args?.message || '').trim();
              const toolSessionId = String(call.args?.sessionId || sessionId);
              const result = await askAgent([{ role: 'user', content: toolMessage }], toolSessionId);
              if (result.task || /marked|postponed/i.test(result.reply || '')) {
                await onTasksChanged?.();
              }
              functionResponses.push({
                id: call.id,
                name: call.name,
                response: {
                  output: result
                }
              });
            } catch (error) {
              functionResponses.push({
                id: call.id,
                name: call.name,
                response: {
                  error: String(error.message || 'Reminder tool failed.')
                }
              });
            }
          }

          if (functionResponses.length) {
            session.sendToolResponse({ functionResponses });
          }
        }
      },
      onerror: (error) => {
        onError?.(error?.message || 'Gemini Live connection failed.');
      },
      onclose: (event) => {
        if (event?.code || event?.reason) {
          onError?.(`Gemini Live closed (${event.code || 'no-code'}${event.reason ? `: ${event.reason}` : ''}).`);
        }
        closeEverything().catch(() => {});
      }
    }
  });

  inputCapture = await createPcmInputCapture(mediaStream, (pcmBlob) => {
    if (!isClosed) {
      session?.sendRealtimeInput({ audio: pcmBlob });
    }
  });
  inputCapture.start();

  return {
    async stop() {
      await closeEverything();
    }
  };
}

class PcmAudioQueue {
  constructor() {
    this.context = new window.AudioContext({ sampleRate: 24000 });
    this.nextStartTime = 0;
    this.sources = new Set();
  }

  async resume() {
    await this.context.resume();
  }

  async enqueue(base64Data, mimeType) {
    const bytes = base64ToBytes(base64Data);
    if (!bytes.length) return;

    if (!String(mimeType || '').includes('pcm')) {
      await this.playBlob(bytes, mimeType || 'audio/wav');
      return;
    }

    const sampleRate = parseSampleRate(mimeType);
    const pcm = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const audioBuffer = this.context.createBuffer(1, pcm.length, sampleRate);
    const channel = audioBuffer.getChannelData(0);
    for (let index = 0; index < pcm.length; index += 1) {
      channel[index] = pcm[index] / 32768;
    }

    const source = this.context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.context.destination);
    const startAt = Math.max(this.context.currentTime + 0.02, this.nextStartTime);
    this.nextStartTime = startAt + audioBuffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
    source.start(startAt);
  }

  async playBlob(bytes, mimeType) {
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.playsInline = true;
    await audio.play().catch(() => {});
    audio.onended = () => URL.revokeObjectURL(url);
  }

  clear() {
    this.sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // ignore already-ended sources
      }
    });
    this.sources.clear();
    this.nextStartTime = this.context.currentTime;
  }

  stop() {
    this.clear();
    this.context.close().catch(() => {});
  }
}

function parseSampleRate(mimeType) {
  const match = String(mimeType || '').match(/rate=(\d+)/i);
  return match ? Number(match[1]) : 24000;
}

function base64ToBytes(data) {
  const binary = window.atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function createPcmInputCapture(mediaStream, onChunk) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  await context.resume();
  const source = context.createMediaStreamSource(mediaStream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const targetRate = 16000;

  let isRunning = false;

  processor.onaudioprocess = (event) => {
    if (!isRunning) return;

    const float32 = event.inputBuffer.getChannelData(0);
    const downsampled = downsampleBuffer(float32, context.sampleRate, targetRate);
    if (!downsampled.length) return;
    const pcmBytes = convertFloatTo16BitPcm(downsampled);
    onChunk(new Blob([pcmBytes], { type: `audio/pcm;rate=${targetRate}` }));
  };

  source.connect(processor);
  processor.connect(context.destination);

  return {
    start() {
      isRunning = true;
    },
    stop() {
      isRunning = false;
      try {
        processor.disconnect();
        source.disconnect();
      } catch {
        // ignore disconnect errors during shutdown
      }
      context.close().catch(() => {});
    }
  };
}

function downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
  if (outputSampleRate >= inputSampleRate) {
    return Float32Array.from(buffer);
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;

    for (let index = offsetBuffer; index < nextOffsetBuffer && index < buffer.length; index += 1) {
      accum += buffer[index];
      count += 1;
    }

    result[offsetResult] = count ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function convertFloatTo16BitPcm(buffer) {
  const pcm = new Int16Array(buffer.length);
  for (let index = 0; index < buffer.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, buffer[index]));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm.buffer;
}
