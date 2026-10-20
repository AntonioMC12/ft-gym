$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
Push-Location $taskRoot
function Set-DemoValue([string]$taskKey, [string]$taskValue) {
  $taskLines = @(Get-Content -LiteralPath '.env.demo')
  $taskFound = $false
  $taskLines = @($taskLines | ForEach-Object {
    if ($_ -match ('^' + [regex]::Escape($taskKey) + '=')) { $taskFound = $true; "$taskKey=$taskValue" } else { $_ }
  })
  if (-not $taskFound) { $taskLines += "$taskKey=$taskValue" }
  $taskLines | Set-Content -LiteralPath '.env.demo' -Encoding utf8
}
try {
  if (-not (Test-Path -LiteralPath '.env.demo')) { throw 'Ejecuta primero scripts/Start-LocalDemo.ps1.' }
  docker compose --env-file .env.demo -f compose.demo.yml exec -T api node -e "const fs=require('fs'); const p='/data/db.json'; const d=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{}; process.exit((d.users||[]).some(u=>u.admin&&!u.disabled)?0:1)"
  if ($LASTEXITCODE -ne 0) { throw 'Crea primero tu perfil administrador en la demo local. El tunel no se ha abierto.' }
  Set-DemoValue 'FT_DEMO_INVITE_ONLY' '1'
  docker compose --env-file .env.demo -f compose.demo.yml up -d api web
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo cerrar el registro publico.' }
  docker compose --env-file .env.demo -f compose.demo.yml --profile share up -d --force-recreate tunnel
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo abrir el tunel.' }
  $taskUrl = $null
  for ($taskAttempt = 0; $taskAttempt -lt 60; $taskAttempt++) {
    $taskLogs = docker compose --env-file .env.demo -f compose.demo.yml logs --no-color tunnel 2>&1 | Out-String
    $taskUrlMatch = [regex]::Match($taskLogs, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($taskUrlMatch.Success) { $taskUrl = $taskUrlMatch.Value; break }
    Start-Sleep -Seconds 1
  }
  if (-not $taskUrl) {
    docker compose --env-file .env.demo -f compose.demo.yml stop tunnel
    throw 'No se obtuvo la direccion del tunel. Revisa los logs; el tunel se ha detenido.'
  }
  Set-DemoValue 'FT_DEMO_ORIGIN' $taskUrl
  Set-DemoValue 'FT_DEMO_RP_ID' ([uri]$taskUrl).Host
  docker compose --env-file .env.demo -f compose.demo.yml up -d api web
  if ($LASTEXITCODE -ne 0) {
    docker compose --env-file .env.demo -f compose.demo.yml stop tunnel
    throw 'No se pudo configurar el acceso HTTPS; el tunel se ha detenido.'
  }
  & (Join-Path $PSScriptRoot 'Prepare-DemoPages.ps1') -DemoUrl $taskUrl
  Write-Host "Demo publica: $taskUrl"
  Write-Host 'Usa contrasenas para las cuentas de prueba. El hostname temporal cambia al recrear el tunel.'
  Write-Host 'Para cerrar el acceso: docker compose --env-file .env.demo -f compose.demo.yml stop tunnel'
} finally { Pop-Location }
