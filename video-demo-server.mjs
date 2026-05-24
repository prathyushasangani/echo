import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, 'promo-output');
const outputPath = path.join(outputDir, 'echo-linkedin-demo.webm');

fs.mkdirSync(outputDir, { recursive: true });

const page = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Echo LinkedIn Demo Video</title>
  <style>
    html, body {
      margin: 0;
      height: 100%;
      background: #030814;
      display: grid;
      place-items: center;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
    }
    canvas {
      width: min(80vw, 540px);
      aspect-ratio: 4 / 5;
      border-radius: 22px;
      box-shadow: 0 30px 90px rgba(0, 0, 0, .55);
    }
    #status {
      position: fixed;
      left: 22px;
      bottom: 18px;
      color: #9fb0d0;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <canvas id="stage" width="1080" height="1350"></canvas>
  <div id="status">Recording demo...</div>
  <script>
    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    const statusEl = document.getElementById('status');
    const W = canvas.width;
    const H = canvas.height;
    const FPS = 30;
    const DURATION = 36;
    const chunks = [];

    const travelReminders = [
      { title: 'Pack passport', time: 'Today, 8:00 AM', tag: 'Travel' },
      { title: 'Check flight tickets', time: 'Today, 6:00 PM', tag: 'Travel' },
      { title: 'Carry chargers', time: 'Before leaving', tag: 'Travel' }
    ];

    function clamp(v, min = 0, max = 1) { return Math.max(min, Math.min(max, v)); }
    function ease(v) { return 1 - Math.pow(1 - clamp(v), 3); }
    function smooth(v) { v = clamp(v); return v * v * (3 - 2 * v); }

    function roundRect(x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }

    function fillRound(x, y, w, h, r, fill, stroke = '', line = 2) {
      roundRect(x, y, w, h, r);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = line;
        ctx.stroke();
      }
    }

    function text(value, x, y, size, weight = 700, color = '#fff', align = 'left', maxWidth) {
      ctx.font = weight + ' ' + size + 'px Inter, Segoe UI, Arial';
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(value, x, y, maxWidth);
    }

    function wrap(value, x, y, size, lineHeight, maxWidth, color = '#dbe7ff', weight = 550) {
      ctx.font = weight + ' ' + size + 'px Inter, Segoe UI, Arial';
      ctx.fillStyle = color;
      const words = value.split(' ');
      let line = '';
      let yy = y;
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          ctx.fillText(line, x, yy);
          line = word;
          yy += lineHeight;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, x, yy);
    }

    function bg(t) {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#06162f');
      g.addColorStop(.56, '#0b1e40');
      g.addColorStop(1, '#180829');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < 7; i++) {
        ctx.strokeStyle = 'rgba(122, 161, 255, .075)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const x = 80 + i * 175 + Math.sin(t * .45 + i) * 18;
        ctx.moveTo(x, 0);
        ctx.lineTo(x - 180, H);
        ctx.stroke();
      }

      const glow = ctx.createRadialGradient(180, 760, 10, 180, 760, 650);
      glow.addColorStop(0, 'rgba(72, 128, 255, .38)');
      glow.addColorStop(1, 'rgba(72, 128, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      const glow2 = ctx.createRadialGradient(920, 950, 20, 920, 950, 640);
      glow2.addColorStop(0, 'rgba(165, 60, 255, .28)');
      glow2.addColorStop(1, 'rgba(165, 60, 255, 0)');
      ctx.fillStyle = glow2;
      ctx.fillRect(0, 0, W, H);
    }

    function header() {
      fillRound(54, 48, 82, 82, 41, '#7057ff');
      text('E', 95, 102, 40, 850, '#fff', 'center');
      text('Echo', 158, 86, 40, 850);
      text('Voice-first reminder agent', 158, 126, 23, 520, '#aebcda');
    }

    function badge(x, y, label, active = false) {
      fillRound(x, y, 160, 64, 18, active ? '#7b3cff' : 'rgba(7, 16, 36, .86)', active ? '#9468ff' : 'rgba(130, 158, 255, .22)');
      text(label, x + 80, y + 41, 22, 750, active ? '#fff' : '#bdc8e3', 'center');
    }

    function micOrb(x, y, pulse = 0, active = true) {
      ctx.strokeStyle = 'rgba(132, 150, 255, .16)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 98 + pulse * 20, 0, Math.PI * 2);
      ctx.stroke();
      const g = ctx.createRadialGradient(x - 36, y - 52, 12, x, y, 78);
      g.addColorStop(0, '#82a4ff');
      g.addColorStop(.55, '#5f5cff');
      g.addColorStop(1, active ? '#9b2bff' : '#35446e');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 78, 0, Math.PI * 2);
      ctx.fill();
      text('🎙', x, y + 26, 70, 800, '#fff', 'center');
    }

    function voicePanel(y, transcript, label = 'Listening...', pulse = 0) {
      fillRound(54, y, 972, 300, 24, 'rgba(9, 23, 52, .82)', 'rgba(122, 150, 255, .23)', 2);
      micOrb(180, y + 150, pulse);
      text('ECHO VOICE', 330, y + 84, 22, 850, '#aebbdd');
      text(label, 330, y + 154, 55, 850);
      if (transcript) text('You: ' + transcript, 330, y + 220, 28, 650, '#9ff5df', 'left', 630);
    }

    function chatBubble(x, y, w, speaker, value, color = '#dbe7ff') {
      fillRound(x, y, w, 128, 24, 'rgba(7, 16, 36, .92)', 'rgba(126, 156, 255, .2)');
      text(speaker, x + 34, y + 46, 20, 850, '#9ff5df');
      wrap(value, x + 34, y + 86, 25, 34, w - 68, color, 650);
    }

    function reminder(x, y, item, i, alpha = 1) {
      ctx.save();
      ctx.globalAlpha = alpha;
      fillRound(x, y, 900, 116, 20, 'rgba(8, 18, 40, .94)', 'rgba(126, 156, 255, .18)');
      fillRound(x + 24, y + 26, 62, 62, 18, i === 0 ? '#14b8a6' : i === 1 ? '#7c3aed' : '#2563eb');
      text(i === 0 ? '✈' : i === 1 ? '☑' : '⚡', x + 55, y + 67, 30, 800, '#fff', 'center');
      text(item.title, x + 112, y + 50, 28, 800);
      text(item.time, x + 112, y + 86, 20, 550, '#aebcda');
      fillRound(x + 748, y + 34, 120, 48, 16, 'rgba(20, 184, 166, .15)', 'rgba(20, 184, 166, .3)');
      text(item.tag, x + 808, y + 65, 19, 800, '#9ff5df', 'center');
      ctx.restore();
    }

    function appShell(y, activeTab = 'Travel') {
      fillRound(58, y, 964, 444, 26, 'rgba(7, 16, 36, .88)', 'rgba(126, 156, 255, .22)');
      fillRound(88, y + 36, 904, 88, 18, '#050b1d', 'rgba(126, 156, 255, .18)');
      text('✦', 128, y + 92, 36, 800, '#8aa9ff');
      text('Pack passport at 8 AM', 180, y + 91, 28, 550, '#aebcda');
      text('REMINDER TYPE', 88, y + 174, 18, 850, '#aebcda');
      const tabs = ['Travel', 'Home', 'Office', 'General', 'One-time'];
      tabs.forEach((tab, i) => badge(88 + i * 176, y + 202, tab, tab === activeTab));
      text('Daily Routines', 88, y + 336, 30, 850);
      text(activeTab + ' reminders stay grouped and easy to scan.', 88, y + 374, 22, 550, '#aebcda');
    }

    function render(frame) {
      const t = frame / FPS;
      bg(t);
      header();

      if (t < 5) {
        text('What if your reminder app', 54, 275, 58, 850);
        text('answered like an assistant?', 54, 340, 58, 850, '#9ff5df');
        wrap('I built Echo to turn spoken tasks and questions into a useful personal reminder workflow.', 58, 405, 30, 42, 905);
        voicePanel(560, t > 2.3 ? 'what are my travel reminders?' : 'what are my travel...', 'Listening...', Math.sin(t * 8) * .5 + .5);
        text('Demo, not a static mockup.', 58, 1210, 32, 850, '#fff');
      } else if (t < 12) {
        const local = t - 5;
        text('Ask a real question', 54, 250, 58, 850);
        chatBubble(70, 350, 920, 'You', 'What are my travel reminders?');
        const reveal = ease((local - 1.2) / 1);
        ctx.save();
        ctx.globalAlpha = reveal;
        chatBubble(70, 520, 920, 'Echo', 'You have 3 travel reminders. Pack passport at 8 AM, check flight tickets at 6 PM, and carry chargers before leaving.', '#dbe7ff');
        ctx.restore();
        for (let i = 0; i < travelReminders.length; i++) {
          reminder(90, 740 + i * 138, travelReminders[i], i, ease((local - 2.5 - i * .35) / .75));
        }
      } else if (t < 19.5) {
        const local = t - 12;
        text('Then act on it', 54, 235, 58, 850);
        wrap('Echo is useful because the answer is connected to actions: done, postpone, review, or add a new reminder.', 58, 295, 29, 40, 900);
        reminder(90, 465, travelReminders[0], 0, 1);
        fillRound(126, 620, 360, 76, 20, '#16a34a');
        text('✓ Mark done', 306, 670, 27, 850, '#fff', 'center');
        fillRound(536, 620, 360, 76, 20, '#7c3aed');
        text('⏱ Postpone', 716, 670, 27, 850, '#fff', 'center');
        chatBubble(70, 790, 920, 'Echo', local > 3.2 ? 'Marked pack passport done. I moved the next travel routine forward.' : 'Waiting for your action...');
        text('The project is about workflow, not only reminders.', 58, 1190, 32, 850, '#9ff5df');
      } else if (t < 27) {
        const local = t - 19.5;
        text('Why people notice it', 54, 235, 58, 850);
        const items = [
          ['🎙', 'Voice-first capture', 'Speak naturally, see live transcript, then let Echo parse intent.'],
          ['🧭', 'Context-aware lists', 'Travel, Home, Office, General, and One-time reminders stay separated.'],
          ['🔔', 'Less noisy alerts', 'Only speaks when something is actually due or when you ask.']
        ];
        for (let i = 0; i < items.length; i++) {
          const y = 390 + i * 190;
          ctx.save();
          ctx.globalAlpha = ease((local - i * .35) / .8);
          fillRound(70, y, 940, 148, 24, 'rgba(7, 16, 36, .9)', 'rgba(126, 156, 255, .18)');
          text(items[i][0], 124, y + 88, 42, 800, '#fff', 'center');
          text(items[i][1], 188, y + 58, 29, 850);
          wrap(items[i][2], 188, y + 98, 22, 30, 740, '#aebcda', 550);
          ctx.restore();
        }
        appShell(990, 'Travel');
      } else {
        const local = t - 27;
        text('Echo', 54, 275, 86, 900);
        wrap('A voice-first personal reminder agent prototype: ask, organize, act, and get useful spoken reminders.', 58, 350, 34, 48, 910, '#dbe7ff', 650);
        fillRound(70, 590, 940, 360, 28, 'rgba(8, 18, 40, .92)', 'rgba(126, 156, 255, .2)');
        text('Prototype demo flow', 116, 665, 34, 850);
        text('1. Ask: "what are my travel reminders?"', 126, 742, 29, 750, '#9ff5df');
        text('2. Echo summarizes matching reminders', 126, 802, 29, 750, '#9ff5df');
        text('3. User completes or postpones from the same flow', 126, 862, 29, 750, '#9ff5df');
        fillRound(70, 1070, 940, 86, 24, '#0a66c2');
        text('Built with React + Node + SQLite + speech APIs', 540, 1126, 28, 850, '#fff', 'center');
        ctx.save();
        ctx.globalAlpha = ease(local / 1);
        text('Would you use push-to-talk or always-on?', 54, 1248, 32, 850, '#fff');
        ctx.restore();
      }
    }

    render(0);
    const stream = canvas.captureStream(FPS);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      statusEl.textContent = 'Saving demo...';
      await fetch('/upload', { method: 'POST', body: new Blob(chunks, { type: 'video/webm' }) });
      statusEl.textContent = 'Saved Echo LinkedIn demo.';
      document.body.dataset.done = 'true';
    };
    recorder.start();
    let frame = 0;
    const timer = setInterval(() => {
      render(frame++);
      if (frame > DURATION * FPS) {
        clearInterval(timer);
        recorder.stop();
      }
    }, 1000 / FPS);
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page);
    return;
  }

  if (req.method === 'POST' && req.url === '/upload') {
    const file = fs.createWriteStream(outputPath);
    req.pipe(file);
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, outputPath }));
      console.log(`Saved ${outputPath}`);
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ exists: fs.existsSync(outputPath), outputPath }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(5189, '127.0.0.1', () => {
  console.log('Echo demo video generator: http://127.0.0.1:5189');
  console.log(`Output: ${outputPath}`);
});
