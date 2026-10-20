$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
Push-Location $taskRoot
try {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Instala Docker Desktop y abrelo con contenedores Linux antes de continuar.'
  }
  docker info --format '{{.ServerVersion}}'
  if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop no esta funcionando.' }
  if (-not (Test-Path -LiteralPath '.env.demo')) { Copy-Item -LiteralPath '.env.demo.example' -Destination '.env.demo' }
  $taskPort = 8088
  $taskMatch = Select-String -Path '.env.demo' -Pattern '^FT_DEMO_PORT=(\d+)$'
  if ($taskMatch) { $taskPort = $taskMatch.Matches[0].Groups[1].Value }
  # Starting locally closes an earlier public session before changing its hostname.
  docker compose --env-file .env.demo -f compose.demo.yml stop tunnel
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo comprobar/cerrar el tunel anterior.' }
  $taskLines = Get-Content -LiteralPath '.env.demo' | ForEach-Object {
    if ($_ -match '^FT_DEMO_ORIGIN=') { "FT_DEMO_ORIGIN=http://localhost:$taskPort" }
    elseif ($_ -match '^FT_DEMO_RP_ID=') { 'FT_DEMO_RP_ID=localhost' }
    else { $_ }
  }
  $taskLines | Set-Content -LiteralPath '.env.demo' -Encoding utf8
  docker compose --env-file .env.demo -f compose.demo.yml up --build -d api web
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo arrancar la demo.' }
  Write-Host "Demo local: http://localhost:$taskPort"
  Write-Host 'Crea tu primer perfil mediante contrasena: sera el administrador de la demo.'
  Write-Host 'Este volumen no contiene los datos de tu instalacion habitual.'
} finally { Pop-Location }
