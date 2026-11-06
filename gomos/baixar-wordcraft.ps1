# Baixa o WordCraft (conversor livre de documentos Word/ODT/RTF -> PDF etc.) para dentro do Gomos.
# Projeto: https://github.com/storytold/wordcraft  (licença MIT/Apache-2.0)
param([string]$Destino = "$env:LOCALAPPDATA\Gomos\wordcraft")
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$arch = switch ($env:PROCESSOR_ARCHITECTURE) { 'ARM64' { 'arm64' } 'x86' { 'x86' } default { 'x64' } }
$h = @{ 'User-Agent' = 'Gomos-instalador' }
$rel = Invoke-RestMethod 'https://api.github.com/repos/storytold/wordcraft/releases/latest' -Headers $h
$zip = $rel.assets | Where-Object { $_.name -like "*windows-$arch-portable.zip" } | Select-Object -First 1
$sums = $rel.assets | Where-Object { $_.name -eq 'SHA256SUMS.txt' } | Select-Object -First 1
if (-not $zip) { throw "pacote portatil para $arch nao encontrado na versao $($rel.tag_name)" }
$tmp = Join-Path $env:TEMP $zip.name
Invoke-WebRequest $zip.browser_download_url -OutFile $tmp -Headers $h
if ($sums) {  # confere a integridade do download
    $lista = (Invoke-WebRequest $sums.browser_download_url -Headers $h -UseBasicParsing).Content
    $esperado = ($lista -split "`n" | Where-Object { $_ -match [regex]::Escape($zip.name) } | ForEach-Object { ($_ -split '\s+')[0] }) | Select-Object -First 1
    $obtido = (Get-FileHash $tmp -Algorithm SHA256).Hash
    if ($esperado -and ($esperado.Trim().ToUpper() -ne $obtido)) { Remove-Item $tmp; throw "checksum nao confere" }
}
if (Test-Path $Destino) { Remove-Item $Destino -Recurse -Force }
Expand-Archive $tmp $Destino -Force
Remove-Item $tmp
Write-Host "   WordCraft $($rel.tag_name) instalado."
