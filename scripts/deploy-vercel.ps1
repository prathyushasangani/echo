param(
  [string]$AdminEmail = "pratsa@gmail.com",
  [string]$ProjectId = "echo-96caa"
)

$ErrorActionPreference = "Stop"

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
$serviceAccountBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($serviceAccountJson))

npx.cmd vercel deploy --prod --yes --force `
  -e DATABASE_PROVIDER=firebase `
  -e FIREBASE_PROJECT_ID=$ProjectId `
  -e FIREBASE_SERVICE_ACCOUNT_BASE64=$serviceAccountBase64 `
  -e AUTH_SECRET=$authSecret `
  -e ADMIN_EMAIL=$AdminEmail `
  -e ALLOW_PASSWORD_SIGNUP=true `
  -e NOTIFICATION_PROVIDER=push `
  -e WAKE_WORD_ENABLED=false
