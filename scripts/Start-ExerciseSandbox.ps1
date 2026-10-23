#requires -Version 7.0
[CmdletBinding()]
param([switch]$NoBuild,[switch]$Stop)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$sandboxRoot=Split-Path $PSScriptRoot -Parent
$dockerContext='desktop-linux'
function Invoke-SandboxDocker([string[]]$Arguments){
  & docker --context $dockerContext @Arguments
  if($LASTEXITCODE -ne 0){throw "Sandbox Docker command failed (exit $LASTEXITCODE). No data has been deleted."}
}
Push-Location $sandboxRoot
try {
  # Explicit context defeats DOCKER_HOST/DOCKER_CONTEXT pointing at a VPS.
  $endpoint=& docker context inspect $dockerContext --format '{{.Endpoints.docker.Host}}'
  if($LASTEXITCODE -ne 0 -or ([string]$endpoint).Trim() -ne 'npipe:////./pipe/dockerDesktopLinuxEngine'){
    throw 'This launcher requires the local Docker Desktop Linux named pipe; remote Docker is forbidden.'
  }
  Invoke-SandboxDocker @('info','--format','{{.ServerVersion}}')
  $artifacts=[IO.Path]::GetFullPath((Join-Path $sandboxRoot '../informes'))
  $dataDirectory=Join-Path $artifacts 'exercises-local-data'
  [IO.Directory]::CreateDirectory($dataDirectory)|Out-Null
  $environmentFile=Join-Path $artifacts 'exercises-local.env'
  # Prevent implicit loading of the checkout's .env. Contains no production configuration.
  if(!(Test-Path -LiteralPath $environmentFile)){Set-Content -LiteralPath $environmentFile -Value '# Fictional local exercise sandbox only.' -Encoding utf8}
  $compose=@('compose','--project-name','ft-gym-exercises-local','--env-file',$environmentFile,'-f','compose.exercises.local.yml')
  if($Stop){Invoke-SandboxDocker ($compose+@('stop'));return}
  if(!$NoBuild){Invoke-SandboxDocker ($compose+@('build','exercises-api','exercises-web'))}
  Invoke-SandboxDocker ($compose+@('up','-d','--wait','--wait-timeout','180','centers-test-db','exercises-api','exercises-web'))
  Write-Output 'Local sandbox: http://localhost:5180'
  Write-Output 'Synthetic login documents: Plataforma Centros 00000000T; Alba Pruebas 00000001R; Bruno Pruebas 00000002W.'
  Write-Output 'Initial fictional password for all three: Centros-Pruebas-2026!'
  Write-Output "Persistent fictional data: $dataDirectory"
  Write-Output 'No tunnel. Stop with: ./scripts/Start-ExerciseSandbox.ps1 -Stop (keeps data).'
} finally { Pop-Location }
