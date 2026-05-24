import { spawn } from 'node:child_process';
import { askReminderAgent } from './chatAgent.js';

const COMMAND_PREFIX = '__ECHO_COMMAND__';
const WAKE_DEBUG_PREFIX = '__ECHO_WAKE_DEBUG__';
const WAKE_STATUS = {
  enabled: false,
  running: false,
  pid: null,
  startedAt: null,
  lastHeardAt: null,
  lastCommand: '',
  lastWakeText: '',
  lastError: '',
  restarts: 0
};
let wakeChild = null;
let restarting = false;

export function startWakeWordListener({ db }) {
  if ((process.env.WAKE_WORD_ENABLED || '').toLowerCase() !== 'true') {
    WAKE_STATUS.enabled = false;
    WAKE_STATUS.running = false;
    return null;
  }

  const wakePhrase = process.env.WAKE_WORD_PHRASE || 'hey echo';
  WAKE_STATUS.enabled = true;
  WAKE_STATUS.lastError = '';

  return launchWakeWordListener({ db, wakePhrase });
}

export function getWakeWordStatus() {
  return { ...WAKE_STATUS };
}

export async function testWakeWordCommand(db, command) {
  return handleWakeCommand(db, command, { speak: false });
}

function launchWakeWordListener({ db, wakePhrase }) {
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', createListenerScript(wakePhrase)],
    {
      windowsHide: true
    }
  );
  wakeChild = child;
  WAKE_STATUS.running = true;
  WAKE_STATUS.pid = child.pid;
  WAKE_STATUS.startedAt = new Date().toISOString();

  let buffer = '';

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith(WAKE_DEBUG_PREFIX)) {
        WAKE_STATUS.lastWakeText = trimmed.slice(WAKE_DEBUG_PREFIX.length).trim();
        continue;
      }

      if (!trimmed.startsWith(COMMAND_PREFIX)) continue;

      const command = trimmed.slice(COMMAND_PREFIX.length).trim();
      if (command) {
        WAKE_STATUS.lastHeardAt = new Date().toISOString();
        WAKE_STATUS.lastCommand = command;
        handleWakeCommand(db, command).catch((error) => {
          console.error('Wake-word command failed:', error);
          WAKE_STATUS.lastError = error.message || String(error);
          speakText("Sorry, I couldn't handle that.");
        });
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    const message = chunk.toString().trim();
    if (message) {
      WAKE_STATUS.lastError = message;
      console.error('Wake-word listener:', message);
    }
  });

  child.on('error', (error) => {
    WAKE_STATUS.running = false;
    WAKE_STATUS.lastError = error.message || String(error);
    console.error('Wake-word listener failed to start:', error);
  });

  child.on('exit', (code) => {
    WAKE_STATUS.running = false;
    WAKE_STATUS.pid = null;
    if (code !== 0) {
      WAKE_STATUS.lastError = `Wake-word listener exited with code ${code}.`;
      console.error(WAKE_STATUS.lastError);
    }
    scheduleWakeRestart({ db, wakePhrase });
  });

  console.log(`Wake-word listener enabled. Say "${wakePhrase}" to talk to Echo.`);
  return child;
}

function scheduleWakeRestart({ db, wakePhrase }) {
  if (!WAKE_STATUS.enabled || restarting) return;
  restarting = true;

  setTimeout(() => {
    restarting = false;
    WAKE_STATUS.restarts += 1;
    console.log('Restarting wake-word listener.');
    launchWakeWordListener({ db, wakePhrase });
  }, 2000);
}

async function handleWakeCommand(db, command, options = {}) {
  const answer = await askReminderAgent(db, [{ role: 'user', content: command }], 'wake-word');
  if (options.speak !== false && answer.shouldSpeak !== false) {
    await speakText(answer.reply || 'Done.');
  }
  return answer;
}

function speakText(text) {
  const escapedText = escapePowerShellString(text);
  const escapedVoiceName = escapePowerShellString(process.env.VOICE_NAME || 'Microsoft Zira Desktop');
  const script = [
    'Add-Type -AssemblyName System.Speech',
    '$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    `$speaker.Rate = ${Number(process.env.VOICE_RATE || -1)}`,
    `$speaker.Volume = ${Number(process.env.VOICE_VOLUME || 100)}`,
    `$preferred = $speaker.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -eq '${escapedVoiceName}' } | Select-Object -First 1`,
    "if (-not $preferred) { $preferred = $speaker.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Gender -eq 'Female' } | Select-Object -First 1 }",
    'if ($preferred) { $speaker.SelectVoice($preferred.VoiceInfo.Name) }',
    `$speaker.Speak('${escapedText}')`,
    '$speaker.Dispose()'
  ].join('; ');

  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Speech exited with code ${code}.`));
    });
  });
}

function createListenerScript(wakePhrase) {
  const escapedWakePhrase = escapePowerShellString(wakePhrase);
  const escapedVoiceName = escapePowerShellString(process.env.VOICE_NAME || 'Microsoft Zira Desktop');
  const minConfidence = Number(process.env.WAKE_WORD_MIN_CONFIDENCE || 0.7);

  return `
    Add-Type -AssemblyName System.Speech
    $wakePhrase = '${escapedWakePhrase}'
    $wakePhrases = @($wakePhrase, 'hello echo', 'echo', 'hey eco', 'hello eco', 'hey eko', 'hello eko', 'hey aiko', 'hello aiko', 'hey go')
    $minConfidence = ${Number.isFinite(minConfidence) ? minConfidence : 0.7}
    $voiceName = '${escapedVoiceName}'

    function Speak-Echo {
      param([string]$Text)
      Add-Type -AssemblyName System.Speech
      $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
      $speaker.Rate = ${Number(process.env.VOICE_RATE || -1)}
      $speaker.Volume = ${Number(process.env.VOICE_VOLUME || 100)}
      $preferred = $speaker.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -eq $voiceName } | Select-Object -First 1
      if (-not $preferred) { $preferred = $speaker.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Gender -eq 'Female' } | Select-Object -First 1 }
      if ($preferred) { $speaker.SelectVoice($preferred.VoiceInfo.Name) }
      $speaker.Speak($Text)
      $speaker.Dispose()
    }

    function New-Recognizer {
      $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine([System.Globalization.CultureInfo]::GetCultureInfo('en-US'))
      $recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
      $recognizer.SetInputToDefaultAudioDevice()
      return $recognizer
    }

    function Normalize-Text {
      param([string]$Text)
      return (($Text.ToLowerInvariant() -replace '[^a-z0-9 ]', ' ') -replace '\\s+', ' ').Trim()
    }

    function Is-WakeText {
      param([string]$Text)
      $normalized = Normalize-Text $Text
      if (-not $normalized) { return $false }
      if ($normalized -match '(^| )(hey|hello|hi)? ?(echo|eco|eko|ecko|ekko|ego|aiko|go)( |$)') { return $true }
      return $false
    }

    function Get-CommandAfterWake {
      param([string]$Text)
      $normalized = Normalize-Text $Text
      $command = ($normalized -replace '^(hey|hello|hi)? ?(echo|eco|eko|ecko|ekko|ego|aiko|go) ?', '').Trim()
      if ($command -and $command -ne $normalized) { return $command }
      return ''
    }

    while ($true) {
      $wakeRecognizer = New-Recognizer
      $wake = $wakeRecognizer.Recognize([TimeSpan]::FromSeconds(6))
      $wakeRecognizer.Dispose()

      if ($wake -and $wake.Text) {
        Write-Output ('${WAKE_DEBUG_PREFIX}' + $wake.Text + ' confidence=' + $wake.Confidence)
      }

      if ($wake -and $wake.Text -and (Is-WakeText $wake.Text) -and $wake.Confidence -ge $minConfidence) {
        $inlineCommand = Get-CommandAfterWake $wake.Text
        Speak-Echo 'Hello, I am listening.'

        if ($inlineCommand) {
          Write-Output ('${COMMAND_PREFIX}' + $inlineCommand)
        } else {
          $commandRecognizer = New-Recognizer
          $command = $commandRecognizer.Recognize([TimeSpan]::FromSeconds(15))
          $commandRecognizer.Dispose()

          if ($command -and $command.Text) {
            Write-Output ('${COMMAND_PREFIX}' + $command.Text)
          } else {
            Speak-Echo 'I did not catch the question.'
          }
        }
      }
    }
  `;
}

function escapePowerShellString(value) {
  return String(value || '').replace(/'/g, "''");
}
