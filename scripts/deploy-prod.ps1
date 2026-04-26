param(
  [string]$WorkerName = "nekodns",
  [string]$DatabaseName = "nekodns",
  [string]$QueueName = "nekodns-jobs"
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Ensure-Env([string]$name) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Missing required environment variable: $name"
  }
  return $value
}

function Upsert-WranglerTomlValue([string]$key, [string]$value) {
  $path = Join-Path $PSScriptRoot "..\wrangler.toml"
  $content = Get-Content -Raw $path
  $escaped = [Regex]::Escape($key)
  $pattern = "(?m)^$escaped\s*=\s*""[^""]*"""
  $replace = "$key = ""$value"""
  if ($content -match $pattern) {
    $newContent = [Regex]::Replace($content, $pattern, $replace)
  } else {
    $newContent = "$content`n$replace`n"
  }
  Set-Content -NoNewline -Path $path -Value $newContent
}

function Set-TopLevelWorkerName([string]$value) {
  $path = Join-Path $PSScriptRoot "..\wrangler.toml"
  $content = Get-Content -Raw $path
  $pattern = "(?m)^name\s*=\s*""[^""]*"""
  $replace = "name = ""$value"""
  if ($content -match $pattern) {
    $newContent = [Regex]::Replace($content, $pattern, $replace, 1)
  } else {
    $newContent = "$replace`n$content"
  }
  Set-Content -NoNewline -Path $path -Value $newContent
}

function Set-SendEmailBindingName([string]$value) {
  $path = Join-Path $PSScriptRoot "..\wrangler.toml"
  $content = Get-Content -Raw $path
  $pattern = "(?ms)(\[\[send_email\]\]\s*[\r\n]+)(name\s*=\s*""[^""]*"")"
  if ($content -match $pattern) {
    $newContent = [Regex]::Replace($content, $pattern, "`${1}name = ""$value""", 1)
    Set-Content -NoNewline -Path $path -Value $newContent
  }
}

function Invoke-WranglerText([string[]]$wranglerArgs) {
  $allArgs = @()
  $allArgs += $wranglerArgs
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = (& npx.cmd wrangler @allArgs 2>&1 | Out-String)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  return @{
    Output = $output
    ExitCode = $exitCode
  }
}

function Invoke-WranglerHost([string[]]$wranglerArgs, [string]$errorMessage) {
  $result = Invoke-WranglerText $wranglerArgs
  if (-not [string]::IsNullOrWhiteSpace($result.Output)) {
    Write-Host $result.Output
  }
  if ($result.ExitCode -ne 0) {
    if ($result.Output -match "Authentication error \[code: 10000\]" -or $result.Output -match "code: 9106") {
      throw "$errorMessage`nWrangler API token is missing required account-level permissions. Set WRANGLER_API_TOKEN with Workers/D1/Queues permissions."
    }
    if ($result.Output -match "/memberships" -and [string]::IsNullOrWhiteSpace($script:CloudflareAccountId)) {
      throw "$errorMessage`nTip: set CLOUDFLARE_ACCOUNT_ID in .env for API-token based deployments."
    }
    throw "$errorMessage`n$result.Output"
  }
}

function Ensure-Queue([string]$queueName) {
  $listResult = Invoke-WranglerText @("queues", "list")
  if ($listResult.ExitCode -ne 0) {
    if ($listResult.Output -match "Authentication error \[code: 10000\]" -or $listResult.Output -match "code: 9106") {
      throw "Failed to list queues.`nWrangler API token is missing required account-level permissions. Set WRANGLER_API_TOKEN (or CLOUDFLARE_API_TOKEN) with Workers/D1/Queues permissions."
    }
    if ($listResult.Output -match "/memberships" -and [string]::IsNullOrWhiteSpace($script:CloudflareAccountId)) {
      throw "Failed to list queues.`nTip: set CLOUDFLARE_ACCOUNT_ID in .env for API-token based deployments."
    }
    throw "Failed to list queues. Output:`n$($listResult.Output)"
  }
  if ($listResult.Output -match [Regex]::Escape($queueName)) {
    Write-Host "Queue already exists: $queueName"
    return
  }
  Write-Host "Creating queue: $queueName"
  Invoke-WranglerHost @("queues", "create", $queueName) "Failed to create queue: $queueName"
}

function Ensure-D1([string]$dbName) {
  $listResult = Invoke-WranglerText @("d1", "list", "--json")
  if ($listResult.ExitCode -ne 0) {
    if ($listResult.Output -match "Authentication error \[code: 10000\]" -or $listResult.Output -match "code: 9106") {
      throw "Failed to list D1 databases.`nWrangler API token is missing required account-level permissions. Set WRANGLER_API_TOKEN (or CLOUDFLARE_API_TOKEN) with Workers/D1/Queues permissions."
    }
    if ($listResult.Output -match "/memberships" -and [string]::IsNullOrWhiteSpace($script:CloudflareAccountId)) {
      throw "Failed to list D1 databases.`nTip: set CLOUDFLARE_ACCOUNT_ID in .env for API-token based deployments."
    }
    throw "Failed to list D1 databases. Output:`n$($listResult.Output)"
  }
  $dbList = $listResult.Output | ConvertFrom-Json
  $found = $dbList | Where-Object { $_.name -eq $dbName } | Select-Object -First 1
  if ($null -ne $found) {
    Write-Host "D1 already exists: $dbName ($($found.uuid))"
    return $found.uuid
  }

  Write-Host "Creating D1 database: $dbName"
  $createResult = Invoke-WranglerText @("d1", "create", $dbName)
  if ($createResult.ExitCode -ne 0) {
    throw "Failed to create D1 database. Output:`n$($createResult.Output)"
  }

  $createJsonMatch = [Regex]::Match($createResult.Output, "\{[\s\S]*\}")
  if ($createJsonMatch.Success) {
    $createJson = $createJsonMatch.Value | ConvertFrom-Json
    if (-not [string]::IsNullOrWhiteSpace($createJson.uuid)) {
      return $createJson.uuid
    }
  }

  $idMatch = [Regex]::Match($createResult.Output, "database_id\s*=\s*""([0-9a-fA-F-]+)""")
  if ($idMatch.Success) {
    return $idMatch.Groups[1].Value
  }

  throw "Could not parse D1 create output:`n$($createResult.Output)"
}

function Put-Secret([string]$name, [string]$value) {
  Write-Host "Uploading secret: $name"
  $allArgs = @("secret", "put", $name)
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = ($value | & npx.cmd wrangler @allArgs 2>&1 | Out-String)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if (-not [string]::IsNullOrWhiteSpace($output)) {
    Write-Host $output
  }
  if ($exitCode -ne 0) {
    throw "Failed to upload secret: $name`n$output"
  }
}

function Import-DotEnv([string]$path) {
  if (-not (Test-Path $path)) {
    return
  }
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if ([string]::IsNullOrWhiteSpace($line)) { return }
    if ($line.StartsWith("#")) { return }
    $pair = $line -split "=", 2
    if ($pair.Count -ne 2) { return }
    $name = $pair[0].Trim()
    $value = $pair[1].Trim().Trim("'").Trim('"')
    if (-not [string]::IsNullOrWhiteSpace($name) -and [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
      [Environment]::SetEnvironmentVariable($name, $value)
    }
  }
}

function Resolve-AccountIdFromZone() {
  $zoneId = [Environment]::GetEnvironmentVariable("CF_ZONE_ID")
  $apiToken = [Environment]::GetEnvironmentVariable("CF_API_TOKEN")
  if ([string]::IsNullOrWhiteSpace($zoneId) -or [string]::IsNullOrWhiteSpace($apiToken)) {
    return $null
  }
  try {
    $response = Invoke-RestMethod -Method Get -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId" -Headers @{ Authorization = "Bearer $apiToken" }
    if ($response.success -and $response.result.account.id) {
      return [string]$response.result.account.id
    }
  } catch {
    return $null
  }
  return $null
}

Import-DotEnv (Join-Path $PSScriptRoot "..\.env")

if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable("WRANGLER_API_TOKEN"))) {
  [Environment]::SetEnvironmentVariable("CLOUDFLARE_API_TOKEN", [Environment]::GetEnvironmentVariable("WRANGLER_API_TOKEN"))
}

if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable("CF_ZONE_ID")) -and -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable("CLOUDFLARE_ZONE_ID"))) {
  [Environment]::SetEnvironmentVariable("CF_ZONE_ID", [Environment]::GetEnvironmentVariable("CLOUDFLARE_ZONE_ID"))
}
if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable("CF_API_TOKEN")) -and -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN"))) {
  [Environment]::SetEnvironmentVariable("CF_API_TOKEN", [Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN"))
}
$script:CloudflareAccountId = [Environment]::GetEnvironmentVariable("CLOUDFLARE_ACCOUNT_ID")
if ([string]::IsNullOrWhiteSpace($script:CloudflareAccountId)) {
  $resolvedAccountId = Resolve-AccountIdFromZone
  if (-not [string]::IsNullOrWhiteSpace($resolvedAccountId)) {
    [Environment]::SetEnvironmentVariable("CLOUDFLARE_ACCOUNT_ID", $resolvedAccountId)
    $script:CloudflareAccountId = $resolvedAccountId
    Write-Host "Auto-resolved CLOUDFLARE_ACCOUNT_ID from CF_ZONE_ID."
  }
}

if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable("WORKER_NAME"))) {
  $WorkerName = [Environment]::GetEnvironmentVariable("WORKER_NAME")
}
if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable("DATABASE_NAME"))) {
  $DatabaseName = [Environment]::GetEnvironmentVariable("DATABASE_NAME")
}
if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable("QUEUE_NAME"))) {
  $QueueName = [Environment]::GetEnvironmentVariable("QUEUE_NAME")
}

Write-Step "Checking required environment variables"
$null = Ensure-Env "CLOUDFLARE_API_TOKEN"
$sessionSecret = Ensure-Env "SESSION_SECRET"
$turnstileSecret = Ensure-Env "TURNSTILE_SECRET_KEY"
$cfZoneId = Ensure-Env "CF_ZONE_ID"
$cfApiToken = Ensure-Env "CF_API_TOKEN"

$emailFrom = [Environment]::GetEnvironmentVariable("EMAIL_FROM")
if ([string]::IsNullOrWhiteSpace($emailFrom)) { $emailFrom = "noreply@example.com" }
$appOrigin = [Environment]::GetEnvironmentVariable("APP_ORIGIN")
if ([string]::IsNullOrWhiteSpace($appOrigin)) { $appOrigin = "https://$WorkerName.workers.dev" }
$parentDomain = [Environment]::GetEnvironmentVariable("PARENT_DOMAIN")
if ([string]::IsNullOrWhiteSpace($parentDomain)) { $parentDomain = "is-cute.cat" }
$turnstileSite = [Environment]::GetEnvironmentVariable("TURNSTILE_SITE_KEY")
if ([string]::IsNullOrWhiteSpace($turnstileSite)) { $turnstileSite = "1x00000000000000000000AA" }
$mailDestination = [Environment]::GetEnvironmentVariable("MAIL_DESTINATION")
if ([string]::IsNullOrWhiteSpace($mailDestination)) { $mailDestination = "admin@example.com" }

Write-Step "Ensuring Cloudflare resources"
Ensure-Queue $QueueName
$dbId = Ensure-D1 $DatabaseName

Write-Step "Updating wrangler.toml bindings"
Set-TopLevelWorkerName $WorkerName
Set-SendEmailBindingName "MAILER"
Upsert-WranglerTomlValue "database_name" $DatabaseName
Upsert-WranglerTomlValue "database_id" $dbId
Upsert-WranglerTomlValue "queue" $QueueName
Upsert-WranglerTomlValue "destination_address" $mailDestination
Upsert-WranglerTomlValue "PARENT_DOMAIN" $parentDomain
Upsert-WranglerTomlValue "EMAIL_FROM" $emailFrom
Upsert-WranglerTomlValue "APP_ORIGIN" $appOrigin
Upsert-WranglerTomlValue "TURNSTILE_SITE_KEY" $turnstileSite

Write-Step "Building frontend"
npm.cmd run build | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "Build failed."
}

Write-Step "Applying D1 migrations"
Invoke-WranglerHost @("d1", "migrations", "apply", $DatabaseName, "--remote") "D1 migration failed."

Write-Step "Uploading worker secrets"
Put-Secret "SESSION_SECRET" $sessionSecret
Put-Secret "TURNSTILE_SECRET_KEY" $turnstileSecret
Put-Secret "CF_ZONE_ID" $cfZoneId
Put-Secret "CF_API_TOKEN" $cfApiToken

$telegramBot = [Environment]::GetEnvironmentVariable("TELEGRAM_BOT_TOKEN")
$telegramGroup = [Environment]::GetEnvironmentVariable("TELEGRAM_GROUP_CHAT_ID")
$telegramSecret = [Environment]::GetEnvironmentVariable("TELEGRAM_WEBHOOK_SECRET")
if (-not [string]::IsNullOrWhiteSpace($telegramBot)) { Put-Secret "TELEGRAM_BOT_TOKEN" $telegramBot }
if (-not [string]::IsNullOrWhiteSpace($telegramGroup)) { Put-Secret "TELEGRAM_GROUP_CHAT_ID" $telegramGroup }
if (-not [string]::IsNullOrWhiteSpace($telegramSecret)) { Put-Secret "TELEGRAM_WEBHOOK_SECRET" $telegramSecret }

Write-Step "Dry-run deploy"
Invoke-WranglerHost @("deploy", "--dry-run", "--outdir", "dist\worker") "Dry-run deploy failed."

Write-Step "Deploying to production"
Invoke-WranglerHost @("deploy") "Production deploy failed."

Write-Step "Deployment complete"
Write-Host "Worker: https://$WorkerName.workers.dev"
Write-Host "D1 database id: $dbId"
