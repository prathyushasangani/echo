import { spawn } from 'node:child_process';
import { askReminderAgent } from './chatAgent.js';

const COMMAND_PREFIX = '__ECHO_COMMAND__';

export function startWakeWordListener({ db }) {
  if ((process.env.WAKE_WORD_ENABLED || '').toLowerCase() !== 'true') return null;

  const wakePhrase = process.env.WAKE_WORD_PHRASE || 'hey echo';
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', createListenerScript(wakePhrase)], {
    windowsHide: true
  });

  let buffer = '';

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith(COMMAND_PREFIX)) continue;

      const command = trimmed.slice(COMMAND_PREFIX.length).trim();
      if (command) {
        handleWakeCommand(db, command).catch((error) => {
          console.error('Wake-word command failed:', error);
          speakText("Sorry, I couldn't handle that.");
        });
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    const message = chunk.toString().trim();
    if (message) console.error('Wake-word listener:', message);
  });

  child.on('error', (error) => {
    console.error('Wake-word listener failed to start:', error);
  });

  child.on('exit', (code) => {
    if (code !== 0) console.error(`Wake-word listener exited with code ${code}.`);
  });

  console.log(`Wake-word listener enabled. Say "${wakePhrase}" to talk to Echo.`);
  return child;
}

async function handleWakeCommand(db, command) {
  const answer = await askReminderAgent(db, [{ role: 'user', content: command }], 'wake-word');
  if (answer.shouldSpeak !== false) {
    await speakText(answer.reply || 'Done.');
  }
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
  const minConfidence = Number(process.env.WAKE_WORD_MIN_CONFIDENCE || 0.86);

  return `
    Add-Type -AssemblyName System.Speech
    $wakePhrase = '${escapedWakePhrase}'
    $minConfidence = ${Number.isFinite(minConfidence) ? minConfidence : 0.86}

    function New-Recognizer {
      param([bool]$UseDictation)
      $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine([System.Globalization.CultureInfo]::GetCultureInfo('en-US'))
      if ($UseDictation) {
        $recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
      } else {
        $choices = New-Object System.Speech.Recognition.Choices
        $choices.Add($wakePhrase) | Out-Null
        $builder = New-Object System.Speech.Recognition.GrammarBuilder
        $builder.Culture = [System.Globalization.CultureInfo]::GetCultureInfo('en-US')
        $builder.Append($choices)
        $recognizer.LoadGrammar((New-Object System.Speech.Recognition.Grammar($builder)))
      }
      $recognizer.SetInputToDefaultAudioDevice()
      return $recognizer
    }

    while ($true) {
      $wakeRecognizer = New-Recognizer $false
      $wake = $wakeRecognizer.Recognize()
      $wakeRecognizer.Dispose()

      if ($wake -and $wake.Text -and $wake.Text.ToLowerInvariant() -eq $wakePhrase.ToLowerInvariant() -and $wake.Confidence -ge $minConfidence) {
        Add-Type -AssemblyName System.Speech
        $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
        $preferred = $speaker.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -eq 'Microsoft Zira Desktop' } | Select-Object -First 1
        if (-not $preferred) { $preferred = $speaker.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Gender -eq 'Female' } | Select-Object -First 1 }
        if ($preferred) { $speaker.SelectVoice($preferred.VoiceInfo.Name) }
        $speaker.Speak('Hello')
        $speaker.Dispose()

        $commandRecognizer = New-Recognizer $true
        $command = $commandRecognizer.Recognize([TimeSpan]::FromSeconds(12))
        $commandRecognizer.Dispose()

        if ($command -and $command.Text) {
          Write-Output ('${COMMAND_PREFIX}' + $command.Text)
        }
      }
    }
  `;
}

function escapePowerShellString(value) {
  return String(value || '').replace(/'/g, "''");
}
