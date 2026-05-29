param(
  [string]$AdminEmail = "pratsa@gmail.com",
  [string]$ProjectId = "echo-96caa"
)

$ErrorActionPreference = "Stop"

function Add-VercelEnv {
  param(
    [string]$Name,
    [string]$Value
  )

  Write-Host "Adding $Name..."
  npx.cmd vercel env rm $Name production --yes 2>$null

  $tempFile = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($tempFile, $Value)
    cmd.exe /c "type `"$tempFile`" | npx vercel env add $Name production"
  } finally {
    Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
  }
}

$serviceAccountPath = Join-Path $PSScriptRoot "..\backend\firebase-service-account.json"
if (!(Test-Path $serviceAccountPath)) {
  throw "Missing Firebase service account file: $serviceAccountPath"
}

$authSecretBytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($authSecretBytes)
$rng.Dispose()
$authSecret = [Convert]::ToBase64String($authSecretBytes)
$serviceAccountJson = Get-Content $serviceAccountPath -Raw

Add-VercelEnv "DATABASE_PROVIDER" "firebase"
Add-VercelEnv "FIREBASE_PROJECT_ID" $ProjectId
Add-VercelEnv "FIREBASE_SERVICE_ACCOUNT_JSON" $serviceAccountJson
Add-VercelEnv "AUTH_SECRET" $authSecret
Add-VercelEnv "ADMIN_EMAIL" $AdminEmail
Add-VercelEnv "ALLOW_PASSWORD_SIGNUP" "true"
Add-VercelEnv "NOTIFICATION_PROVIDER" "push"
Add-VercelEnv "WAKE_WORD_ENABLED" "false"

Write-Host "Done. Redeploy Vercel so the new environment variables are used."
