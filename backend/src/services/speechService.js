import { spawn } from 'node:child_process';

const SPEECH_TIMEOUT_MS = 12_000;

export function listenOnce() {
  const script = `
    Add-Type -AssemblyName System.Speech
    $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine([System.Globalization.CultureInfo]::GetCultureInfo('en-US'))
    $grammar = New-Object System.Speech.Recognition.DictationGrammar
    $recognizer.LoadGrammar($grammar)
    $recognizer.SetInputToDefaultAudioDevice()
    $result = $recognizer.Recognize([TimeSpan]::FromSeconds(8))
    if ($result -and $result.Text) { Write-Output $result.Text }
    $recognizer.Dispose()
  `;

  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error('I did not hear anything clearly. Please try again.'));
    }, SPEECH_TIMEOUT_MS);

    function settle(callback) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      callback();
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      settle(() => reject(error));
    });
    child.on('exit', (code) => {
      settle(() => {
        const transcript = stdout.trim();
        if (code !== 0) {
          reject(new Error(stderr.trim() || `Speech recognition exited with code ${code}.`));
        } else if (!transcript) {
          reject(new Error('I did not hear anything clearly. Please try again.'));
        } else {
          resolve(transcript);
        }
      });
    });
  });
}
