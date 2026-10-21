param([Parameter(Mandatory = $true)][string]$DemoUrl)
$ErrorActionPreference = 'Stop'
$taskUri = $null
if (-not [uri]::TryCreate($DemoUrl, [UriKind]::Absolute, [ref]$taskUri) -or $taskUri.Scheme -ne 'https' -or $taskUri.UserInfo -or $taskUri.Query -or $taskUri.Fragment) {
  throw 'La demo debe tener una URL HTTPS sin credenciales, parametros ni fragmentos.'
}
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskOut = Join-Path $taskRoot '.demo-pages'
New-Item -ItemType Directory -Force $taskOut | Out-Null
Copy-Item -LiteralPath (Join-Path $taskRoot 'demo-pages/index.html') -Destination (Join-Path $taskOut 'index.html')
Copy-Item -LiteralPath (Join-Path $taskRoot 'frontend/public/icon-512.png') -Destination (Join-Path $taskOut 'icon.png')
@{ demoUrl = $taskUri.AbsoluteUri.TrimEnd('/') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskOut 'config.json') -Encoding utf8
Set-Content -LiteralPath (Join-Path $taskOut '.nojekyll') -Value '' -Encoding ascii
Write-Host "Portada preparada para GitHub Pages: $taskOut"
Write-Host 'No se ha publicado ni se ha activado ningun workflow del repositorio.'
