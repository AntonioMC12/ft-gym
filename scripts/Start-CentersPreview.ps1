#requires -Version 7.0
[CmdletBinding()]
param([switch]$Share,[switch]$Local,[switch]$NoBuild)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
if($Share -and $Local){throw 'Choose either -Share or -Local.'}
$previewRoot=Split-Path $PSScriptRoot -Parent
$dockerCommand=Get-Command docker -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
$dockerPath=if($dockerCommand){$dockerCommand.Source}else{Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'}
if(!(Test-Path -LiteralPath $dockerPath)){throw 'Docker Desktop CLI was not found.'}
function Invoke-PreviewDocker([string[]]$Arguments){
  & $dockerPath @Arguments
  if($LASTEXITCODE -ne 0){throw "Docker command failed (exit $LASTEXITCODE). Existing data has not been deleted."}
}
Push-Location $previewRoot
try{
  if(!(Test-Path -LiteralPath 'compose.centers.preview.yml')){throw 'Run from the openGym checkout.'}
  Invoke-PreviewDocker -Arguments @('info','--format','{{.ServerVersion}}')
  $previewArtifacts=[IO.Path]::GetFullPath((Join-Path $previewRoot '../informes'))
  [IO.Directory]::CreateDirectory($previewArtifacts)|Out-Null
  $runtimeFile=Join-Path $previewArtifacts 'centers-preview-share.env'
  $existingJson=& $dockerPath inspect ft-gym-centers-preview 2>$null
  if($LASTEXITCODE -eq 0){
    $existing=($existingJson|ConvertFrom-Json)[0]
    if($existing.Config.Labels.'com.docker.compose.service' -ne 'centers-preview-api' -or !($existing.Mounts|Where-Object Destination -eq '/tmp/ft-gym-centers-preview-data')){
      throw 'Legacy/unmanaged preview found. Preserve its temporary accounts/training using CENTERS_DEVELOPMENT.md before replacing it.'
    }
  }
  foreach($folder in @('centers-preview-data','centers-stripe-preview')){[IO.Directory]::CreateDirectory((Join-Path $previewArtifacts $folder))|Out-Null}
  $tunnelName='ft-gym-centers-tests-centers-preview-tunnel-1'
  $runningText=& $dockerPath inspect $tunnelName --format '{{.State.Running}}' 2>$null
  $tunnelRunning=$LASTEXITCODE -eq 0 -and "$runningText".Trim() -eq 'true'
  $sharing=$Share -or (!$Local -and $tunnelRunning)
  $previewOrigin='http://localhost:5178'
  if($sharing -and $tunnelRunning -and (Test-Path -LiteralPath $runtimeFile)){
    $savedOrigin=Get-Content -LiteralPath $runtimeFile|Where-Object {$_ -match '^CENTERS_PREVIEW_ORIGIN=https://[a-z0-9-]+\.trycloudflare\.com$'}|Select-Object -First 1
    if($savedOrigin){$previewOrigin=$savedOrigin.Substring('CENTERS_PREVIEW_ORIGIN='.Length)}
  }
  $revision=(& git rev-parse HEAD).Trim();if($LASTEXITCODE -ne 0){throw 'Git revision unavailable.'}
  $sourceChanges=& git status --porcelain --untracked-files=normal -- api frontend web .dockerignore
  if($LASTEXITCODE -ne 0){throw 'Cannot determine preview source state.'}
  if($sourceChanges){$revision+='-dirty'}
  $branch=(& git branch --show-current).Trim();if($LASTEXITCODE -ne 0){throw 'Git branch unavailable.'}
  function Write-PreviewEnvironment([string]$Origin){
    Set-Content -LiteralPath $runtimeFile -Value @("CENTERS_PREVIEW_ORIGIN=$Origin","CENTERS_PREVIEW_REVISION=$revision","CENTERS_PREVIEW_BRANCH=$branch") -Encoding utf8
  }
  Write-PreviewEnvironment $previewOrigin
  $composeArgs=@('compose','--env-file',$runtimeFile,'-f','compose.centers.test.yml','-f','compose.centers.preview.yml')
  if($Local -and $tunnelRunning){Invoke-PreviewDocker ($composeArgs+@('stop','centers-preview-tunnel'));$tunnelRunning=$false}
  if(!$NoBuild){Invoke-PreviewDocker ($composeArgs+@('build','centers-preview-api','centers-preview-web'))}
  Invoke-PreviewDocker ($composeArgs+@('up','-d','--wait','--wait-timeout','80','centers-test-db'))
  Invoke-PreviewDocker ($composeArgs+@('run','--rm','--no-deps','centers-preview-api','node','test/centers-integration/preview-init.mjs'))
  Invoke-PreviewDocker ($composeArgs+@('up','-d','--wait','--wait-timeout','80','centers-preview-api','centers-preview-web'))
  if($sharing){
    if(!$tunnelRunning){Invoke-PreviewDocker ($composeArgs+@('--profile','share','up','-d','--no-deps','--force-recreate','centers-preview-tunnel'))}
    $publicOrigin=$null
    for($attempt=0;$attempt -lt 20;$attempt++){
      $started=& $dockerPath inspect $tunnelName --format '{{.State.StartedAt}}';if($LASTEXITCODE -ne 0){throw 'Tunnel container unavailable.'}
      $logFile=Join-Path $previewArtifacts 'centers-preview-tunnel-current.log'
      & $dockerPath logs --since "$started" $tunnelName *> $logFile
      if($LASTEXITCODE -ne 0){throw 'Cannot read tunnel log.'}
      $match=[regex]::Match([string](Get-Content -LiteralPath $logFile -Raw),'https://[a-z0-9-]+\.trycloudflare\.com')
      if($match.Success){$publicOrigin=$match.Value;break}
      Start-Sleep -Seconds 1
    }
    if(!$publicOrigin){throw 'Tunnel did not provide a URL. Check centers-preview-tunnel-current.log.'}
    Write-PreviewEnvironment $publicOrigin
    Invoke-PreviewDocker ($composeArgs+@('up','-d','--wait','--wait-timeout','80','centers-preview-api','centers-preview-web'))
    $previewOrigin=$publicOrigin
  }
  Write-Output "Preview: $previewOrigin/#/centers"
  Write-Output 'Fictional account: Plataforma Centros; password: Centros-Pruebas-2026!'
  foreach($service in @('centers-preview-api','centers-preview-web')){
    $containerId=& $dockerPath @composeArgs ps -q $service
    if($LASTEXITCODE -ne 0 -or !$containerId){throw "Running container missing: $service"}
    $format=$service+' revision={{index .Config.Labels "org.opencontainers.image.revision"}} branch={{index .Config.Labels "com.ftgym.branch"}} image={{.Image}} status={{.State.Status}}'
    Invoke-PreviewDocker -Arguments @('inspect',([string]$containerId).Trim(),'--format',$format)
  }
}finally{Pop-Location}
