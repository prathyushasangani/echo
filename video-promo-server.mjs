import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, 'promo-output');
const outputPath = path.join(outputDir, 'echo-linkedin-prototype.webm');

fs.mkdirSync(outputDir, { recursive: true });

const page = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Echo LinkedIn Prototype Video</title>
  <style>
    html, body {
      margin: 0;
      height: 100%;
      background: #050914;
      display: grid;
      place-items: center;
      color: white;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
    }
    canvas {
      width: min(80vw, 540px);
      aspect-ratio: 4 / 5;
      border-radius: 20px;
      box-shadow: 0 30px 90px rgba(0, 0, 0, .55);
      background: #09142d;
    }
    .status {
      position: fixed;
      left: 24px;
      bottom: 18px;
      color: #9fb0d0;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <canvas id="stage" width="1080" height="1350"></canvas>
  <div class="status" id="status">Rendering Echo prototype video...</div>
  <script>
    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    const statusEl = document.getElementById('status');
    const W = canvas.width;
    const H = canvas.height;
    const FPS = 30;
    const DURATION = 32;
    const chunks = [];

    function clamp(v, min = 0, max = 1) { return Math.max(min, Math.min(max, v)); }
    function ease(v) { return 1 - Math.pow(1 - clamp(v), 3); }
    function smooth(v) { v = clamp(v); return v * v * (3 - 2 * v); }
    function lerp(a, b, t) { return a + (b - a) * t; }

    function roundRect(x, y, w, h, r) {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
    }

    function fillRound(x, y, w, h, r, fill, stroke, line = 2) {
      roundRect(x, y, w, h, r);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = line;
        ctx.stroke();
      }
    }

    function text(value, x, y, size, weight = 600, color = '#fff', align = 'left', maxWidth) {
      ctx.fillStyle = color;
      ctx.font = weight + ' ' + size + 'px Inter, Segoe UI, Arial';
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(value, x, y, maxWidth);
    }

    function wrap(value, x, y, size, lineHeight, maxWidth, color = '#dce7ff', weight = 500) {
      ctx.font = weight + ' ' + size + 'px Inter, Segoe UI, Arial';
      ctx.fillStyle = color;
      const words = value.split(' ');
      let line = '';
      let lineY = y;
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          ctx.fillText(line, x, lineY);
          line = word;
          lineY += lineHeight;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, x, lineY);
    }

    function gradientBackground(t) {
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#06152e');
      bg.addColorStop(.48, '#0b1d3e');
      bg.addColorStop(1, '#170926');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < 5; i++) {
        const x = 160 + i * 220 + Math.sin(t * .7 + i) * 24;
        ctx.strokeStyle = 'rgba(75, 132, 255, .08)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x - 140, H);
        ctx.stroke();
      }

      const glow = ctx.createRadialGradient(220, 960, 20, 220, 960, 660);
      glow.addColorStop(0, 'rgba(72, 128, 255, .35)');
      glow.addColorStop(1, 'rgba(72, 128, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      const glow2 = ctx.createRadialGradient(900, 930, 20, 900, 930, 600);
      glow2.addColorStop(0, 'rgba(158, 63, 255, .24)');
      glow2.addColorStop(1, 'rgba(158, 63, 255, 0)');
      ctx.fillStyle = glow2;
      ctx.fillRect(0, 0, W, H);
    }

    function brandHeader() {
      fillRound(54, 52, 86, 86, 43, '#7057ff');
      text('E', 97, 108, 42, 800, '#fff', 'center');
      text('Echo', 164, 92, 42, 800);
      text('Personal Reminder Assistant', 164, 132, 24, 500, '#aebbdd');
    }

    function phoneShell(x, y, w, h, alpha = 1) {
      ctx.save();
      ctx.globalAlpha = alpha;
      fillRound(x, y, w, h, 34, 'rgba(7, 17, 38, .92)', 'rgba(116, 145, 255, .22)', 2);
      fillRound(x + 26, y + 28, w - 52, 104, 18, '#070e22', 'rgba(119, 155, 255, .18)', 2);
      text('Pack passport at 8 AM', x + 94, y + 94, 28, 500, '#9fb0d0');
      text('✦', x + 54, y + 96, 40, 700, '#8aa9ff');
      text('REMINDER TYPE', x + 30, y + 180, 18, 800, '#aebbdd');
      const tabs = ['Travel', 'Home', 'Office', 'General', 'One-time'];
      const tabX = [x + 30, x + 168, x + 302, x + 438, x + 600];
      for (let i = 0; i < tabs.length; i++) {
        const active = tabs[i] === 'One-time';
        fillRound(tabX[i], y + 205, active ? 138 : 112, 64, 14, active ? '#7d3dff' : 'rgba(6, 13, 30, .75)', active ? '#8f57ff' : 'rgba(128, 153, 255, .18)');
        text(tabs[i], tabX[i] + (active ? 69 : 56), y + 246, 23, 600, active ? '#fff' : '#b9c3dd', 'center');
      }
      ctx.restore();
    }

    function voicePanel(x, y, w, h, transcript, pulse, alpha = 1) {
      ctx.save();
      ctx.globalAlpha = alpha;
      fillRound(x, y, w, h, 22, 'rgba(10, 24, 55, .78)', 'rgba(115, 147, 255, .22)', 2);
      const cx = x + 155, cy = y + h / 2;
      ctx.strokeStyle = 'rgba(120, 140, 255, .18)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 90 + pulse * 18, 0, Math.PI * 2); ctx.stroke();
      const orb = ctx.createRadialGradient(cx - 40, cy - 55, 10, cx, cy, 82);
      orb.addColorStop(0, '#7ea0ff');
      orb.addColorStop(.55, '#6558ff');
      orb.addColorStop(1, '#932cff');
      ctx.fillStyle = orb;
      ctx.beginPath(); ctx.arc(cx, cy, 78, 0, Math.PI * 2); ctx.fill();
      text('🎙', cx, cy + 26, 72, 700, '#fff', 'center');

      text('ECHO VOICE', x + 300, y + 92, 22, 800, '#aebbdd');
      text('Listening...', x + 300, y + 162, 56, 800);
      if (transcript) text('You: ' + transcript, x + 300, y + 222, 27, 600, '#9ff5df', 'left', w - 350);
      ctx.restore();
    }

    function reminderCard(x, y, title, meta, color, checked = false, alpha = 1) {
      ctx.save();
      ctx.globalAlpha = alpha;
      fillRound(x, y, 470, 108, 16, 'rgba(8, 18, 40, .92)', 'rgba(118, 148, 255, .18)', 2);
      fillRound(x + 22, y + 26, 54, 54, 16, checked ? '#24c58b' : color);
      text(checked ? '✓' : '•', x + 49, y + 63, 28, 800, '#fff', 'center');
      text(title, x + 96, y + 48, 24, 750);
      text(meta, x + 96, y + 82, 18, 500, '#99a9cc');
      ctx.restore();
    }

    function useCasePill(x, y, icon, label, detail, alpha = 1) {
      ctx.save();
      ctx.globalAlpha = alpha;
      fillRound(x, y, 456, 122, 18, 'rgba(7, 16, 36, .86)', 'rgba(126, 156, 255, .18)', 2);
      text(icon, x + 44, y + 72, 40, 700, '#fff', 'center');
      text(label, x + 84, y + 50, 25, 800);
      text(detail, x + 84, y + 84, 18, 500, '#aebbdd');
      ctx.restore();
    }

    function render(frame) {
      const t = frame / FPS;
      gradientBackground(t);
      brandHeader();

      if (t < 5.2) {
        const p = ease(t / 1.1);
        text('Voice-first reminders', 54, 270, 72, 850);
        wrap('Capture tasks naturally, organize them by context, and get spoken reminders when they matter.', 58, 330, 30, 42, 890, '#d7e4ff', 550);
        phoneShell(70, 470 + (1 - p) * 80, 940, 335, p);
        voicePanel(70, 850, 940, 310, t > 2.2 ? 'Remind me to pack passport at 8 AM' : 'Remind me to pack...', Math.sin(t * 7) * .5 + .5, p);
        text('Built for real life, not just task lists.', 54, 1240, 30, 750, '#9ff5df');
      } else if (t < 11.5) {
        const local = t - 5.2;
        text('From sentence to reminder', 54, 250, 58, 850);
        wrap('Echo listens, parses intent, and files the reminder in the right place.', 58, 310, 28, 40, 850, '#d7e4ff');
        voicePanel(70, 405, 940, 285, 'Buy medicine after 30 minutes', Math.sin(t * 8) * .5 + .5);
        const p = ease((local - 1.0) / 1.0);
        reminderCard(70, 760, 'Buy medicine', 'One-time • due in 30 min', '#7057ff', false, p);
        reminderCard(540, 760, 'Water plants', 'Home • daily at 8 AM', '#2563eb', false, p);
        reminderCard(70, 900, 'Client report', 'Office • 5 PM today', '#8b5cf6', false, p);
        reminderCard(540, 900, 'Check tickets', 'Travel • 6 PM today', '#14b8a6', false, p);
        text('No menus. No forms. Just speak.', 54, 1196, 34, 800, '#9ff5df');
      } else if (t < 18.4) {
        const local = t - 11.5;
        text('Organized around your day', 54, 245, 58, 850);
        wrap('Travel, Home, Office, General, and One-time reminders stay separated and easy to scan.', 58, 305, 28, 40, 880, '#d7e4ff');
        const labels = [
          ['Travel', 'Passport, tickets, chargers'],
          ['Home', 'Plants, groceries, routines'],
          ['Office', 'Calls, reports, meetings'],
          ['One-time', 'Anything urgent or temporary']
        ];
        for (let i = 0; i < labels.length; i++) {
          const x = i % 2 === 0 ? 70 : 550;
          const y = 445 + Math.floor(i / 2) * 170;
          useCasePill(x, y, ['✈', '⌂', '▣', '⏱'][i], labels[i][0], labels[i][1], ease((local - i * .2) / .9));
        }
        phoneShell(70, 850, 940, 335, .95);
      } else if (t < 25.3) {
        const local = t - 18.4;
        text('A useful assistant, not noise', 54, 245, 58, 850);
        wrap('Ask what is next, complete reminders, postpone them, or hear only what is due.', 58, 305, 28, 40, 880, '#d7e4ff');
        fillRound(70, 445, 940, 160, 22, 'rgba(7, 16, 36, .88)', 'rgba(126, 156, 255, .18)', 2);
        text('You: what are my travel reminders?', 110, 505, 28, 700, '#9ff5df');
        text('Echo: You have 2 travel reminders today.', 110, 560, 28, 700, '#d7e4ff');
        reminderCard(85, 700, 'Pack passport', 'Travel • 8 AM', '#14b8a6', local > 2.2);
        reminderCard(555, 700, 'Check tickets', 'Travel • 6 PM', '#14b8a6', false);
        reminderCard(85, 850, 'Client report', 'Office • postponed to 5 PM', '#8b5cf6', false);
        text('Done and postpone flows are built in.', 54, 1168, 34, 800, '#9ff5df');
      } else {
        const local = t - 25.3;
        const p = ease(local / 1);
        text('Echo', 54, 300, 86, 900);
        wrap('A personal reminder agent with voice capture, context-aware categories, and spoken reminders.', 58, 370, 34, 48, 920, '#d7e4ff', 650);
        fillRound(70, 590, 940, 390, 28, 'rgba(8, 18, 40, .9)', 'rgba(119, 155, 255, .2)', 2);
        text('Prototype highlights', 110, 665, 34, 850);
        text('✓ Live voice transcript', 120, 735, 30, 750, '#9ff5df');
        text('✓ Smart reminder parsing', 120, 795, 30, 750, '#9ff5df');
        text('✓ Travel / Home / Office grouping', 120, 855, 30, 750, '#9ff5df');
        text('✓ Spoken due reminders', 120, 915, 30, 750, '#9ff5df');
        fillRound(70, 1080, 470, 78, 20, '#0a66c2');
        text('LinkedIn prototype demo', 305, 1130, 25, 800, '#fff', 'center');
        fillRound(565, 1080, 445, 78, 20, 'rgba(255,255,255,.08)', 'rgba(255,255,255,.18)');
        text('Built with React + Node', 787, 1130, 25, 800, '#fff', 'center');
        ctx.globalAlpha = p;
        text('Voice-first productivity, made personal.', 54, 1250, 31, 800, '#fff');
        ctx.globalAlpha = 1;
      }
    }

    let frame = 0;
    render(0);
    const stream = canvas.captureStream(FPS);
    const preferred = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType: preferred, videoBitsPerSecond: 7_500_000 });
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = async () => {
      statusEl.textContent = 'Saving video...';
      const blob = new Blob(chunks, { type: 'video/webm' });
      await fetch('/upload', { method: 'POST', body: blob });
      statusEl.textContent = 'Saved Echo LinkedIn prototype video.';
      document.body.dataset.done = 'true';
    };
    recorder.start();
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

server.listen(5188, '127.0.0.1', () => {
  console.log('Echo promo video generator: http://127.0.0.1:5188');
  console.log(`Output: ${outputPath}`);
});
