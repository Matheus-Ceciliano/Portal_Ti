<#
.SYNOPSIS
    Verificacao somente leitura do repositorio antes de um commit (Etapa 0).

.DESCRIPTION
    Confere se algum arquivo sensivel esta rastreado, preparado (staged) ou
    seria incluido por um "git add" e, se o gitleaks estiver disponivel, varre
    os arquivos versionaveis. Nao executa git add, commit, push nem altera
    arquivos do repositorio. Procedimento completo em
    docs/SEGURANCA_REPOSITORIO.md.

    Codigo de saida: 0 = sem problemas; 1 = problema encontrado;
    2 = verificacao incompleta (gitleaks ausente e -ExigirGitleaks informado).

.PARAMETER GitleaksPath
    Caminho do gitleaks.exe. Se omitido, procura "gitleaks" no PATH.

.PARAMETER ExigirGitleaks
    Falha (codigo 2) quando o gitleaks nao for encontrado.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verificar-repositorio.ps1 -ExigirGitleaks
#>
[CmdletBinding()]
param(
    [string]$GitleaksPath,
    [switch]$ExigirGitleaks
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$raiz = (& git rev-parse --show-toplevel).Trim()
if (-not $raiz) { Write-Error 'Execute dentro do repositorio vallur-ti-portal.'; exit 1 }
Set-Location -LiteralPath $raiz

# Prefixos e extensoes que nunca podem ser versionados (R-21, R-23).
# Prefixos sem acento: casam com "docs/Inventario/" e "docs/dISTRIBUICAO DE CUSTOS/".
$prefixosSensiveis = @('TER - TDV/', 'docs/SGSI/', 'docs/Invent', 'docs/dISTRIBUI')
$regexSensivel = '(?i)(\.(xlsx|xlsm|xls|csv|zip|pem|key|pfx|p12|cer|crt|jks|ppk|kdbx|ovpn|dump|backup|bak|sql\.gz|har|heapsnapshot)$)|(^|/)\.env($|\.(?!example$))|(^|/)(id_rsa|id_ecdsa|id_ed25519)|(^|/)\.npmrc$|(^|/)settings\.local\.json$|(^|/)CLAUDE\.local\.md$'
$excecoes = '^tests/fixtures/.*\.csv$'

function Get-ListaGit([string[]]$argumentos) {
    $saida = & git -c core.quotepath=off @argumentos
    if ($LASTEXITCODE -ne 0) { throw "git $($argumentos -join ' ') falhou" }
    return @($saida | Where-Object { $_ })
}

function Test-Sensivel([string]$caminho) {
    $c = $caminho -replace '\\', '/'
    if ($c -match $excecoes) { return $false }
    foreach ($p in $prefixosSensiveis) { if ($c.StartsWith($p, [StringComparison]::OrdinalIgnoreCase)) { return $true } }
    return ($c -match $regexSensivel)
}

$problemas = New-Object System.Collections.Generic.List[string]

$rastreados = Get-ListaGit @('ls-files')
$preparados = Get-ListaGit @('diff', '--cached', '--name-only')
$candidatos = Get-ListaGit @('ls-files', '--others', '--exclude-standard')
$ignorados  = Get-ListaGit @('ls-files', '--others', '--ignored', '--exclude-standard')

Write-Host '== Estado do Git'
Write-Host ("Rastreados: {0} | Preparados: {1} | Seriam incluidos por git add: {2} | Ignorados: {3}" -f $rastreados.Count, $preparados.Count, $candidatos.Count, $ignorados.Count)

foreach ($grupo in @(@{ Nome = 'rastreado'; Lista = $rastreados }, @{ Nome = 'preparado'; Lista = $preparados }, @{ Nome = 'nao ignorado (entraria em git add)'; Lista = $candidatos })) {
    foreach ($arq in $grupo.Lista) {
        if (Test-Sensivel $arq) { $problemas.Add("Arquivo sensivel $($grupo.Nome): $arq") }
    }
}

# Os materiais conhecidos da TI precisam continuar presentes apenas como ignorados.
$sensiveisIgnorados = @($ignorados | Where-Object { Test-Sensivel $_ })
Write-Host ("Arquivos sensiveis presentes e ignorados: {0}" -f $sensiveisIgnorados.Count)

# Varredura de segredos nos arquivos que seriam versionados.
Write-Host '== Varredura de segredos (gitleaks)'
if (-not $GitleaksPath) {
    $cmd = Get-Command gitleaks -ErrorAction SilentlyContinue
    if ($cmd) { $GitleaksPath = $cmd.Source }
}
$gitleaksExecutado = $false
if ($GitleaksPath -and (Test-Path -LiteralPath $GitleaksPath)) {
    $versionaveis = @($rastreados + $candidatos | Sort-Object -Unique)
    $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("vallur-verificacao-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temp | Out-Null
    try {
        foreach ($arq in $versionaveis) {
            if (-not (Test-Path -LiteralPath $arq -PathType Leaf)) { continue }
            $destino = Join-Path $temp $arq
            New-Item -ItemType Directory -Force -Path (Split-Path $destino -Parent) | Out-Null
            Copy-Item -LiteralPath $arq -Destination $destino
        }
        $relatorio = Join-Path $temp 'relatorio-gitleaks.json'
        & $GitleaksPath dir $temp --redact=100 --no-banner --log-level error --report-format json --report-path $relatorio
        $codigo = $LASTEXITCODE
        $achados = @()
        if (Test-Path -LiteralPath $relatorio) {
            # No PowerShell 5.1, ConvertFrom-Json devolve "[]" como um unico objeto;
            # o pipeline desfaz o array e descarta entradas vazias.
            $json = ConvertFrom-Json (Get-Content -LiteralPath $relatorio -Raw)
            $achados = @($json | Where-Object { $_ -and $_.RuleID })
        }
        $gitleaksExecutado = $true
        Write-Host ("gitleaks: {0} arquivos varridos, {1} achados (valores redigidos), codigo {2}" -f $versionaveis.Count, $achados.Count, $codigo)
        foreach ($a in $achados) {
            $rel = ($a.File -replace '\\', '/') -replace '^.*vallur-verificacao-[0-9a-f]+/', ''
            $problemas.Add("gitleaks: regra $($a.RuleID) em $rel (linha $($a.StartLine))")
        }
        if ($codigo -ne 0 -and $achados.Count -eq 0) { $problemas.Add("gitleaks terminou com codigo $codigo") }
    }
    finally {
        Remove-Item -LiteralPath $temp -Recurse -Force
    }
}
else {
    Write-Host 'gitleaks nao encontrado: varredura de segredos NAO executada.'
}

Write-Host '== Resultado'
if ($problemas.Count -gt 0) {
    $problemas | ForEach-Object { Write-Host "PROBLEMA: $_" }
    exit 1
}
if (-not $gitleaksExecutado -and $ExigirGitleaks) {
    Write-Host 'INCOMPLETO: nenhum arquivo sensivel exposto, mas a varredura de segredos nao foi executada.'
    exit 2
}
Write-Host 'OK: nenhum arquivo sensivel rastreado, preparado ou incluivel; nenhum segredo detectado.'
exit 0
