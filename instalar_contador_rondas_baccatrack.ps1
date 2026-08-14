$ErrorActionPreference = "Stop"

$project = "C:\Users\grupo\Downloads\BaccaTrack_3_1_ESTADISTICO_PRO_FINAL"
$file = Join-Path $project "public\index.html"

if (-not (Test-Path $file)) {
    Write-Host "NO ENCONTRE: $file" -ForegroundColor Red
    exit 1
}

# 1) Crear copia de seguridad
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = "$file.bak-rondas-$stamp"
Copy-Item $file $backup -Force
Write-Host "COPIA DE SEGURIDAD: $backup" -ForegroundColor Green

# 2) Leer el archivo
$html = [System.IO.File]::ReadAllText($file)

# 3) Agregar estilo visual para el contador, solo si todavía no existe
if ($html -notmatch "\.signal-round\s*\{") {
    $css = @'
<style id="baccatrack-round-style">
.signal-round{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  margin-left:10px;
  padding:4px 11px;
  border-radius:999px;
  border:1px solid #ff2bb588;
  background:#ff2bb512;
  color:#ff8bd8;
  font-size:17px;
  font-weight:900;
  vertical-align:middle;
  box-shadow:0 0 15px #ff2bb522;
  letter-spacing:.02em;
}
@media(max-width:500px){
  .signal-round{
    margin-left:6px;
    padding:3px 8px;
    font-size:14px;
  }
}
</style>
'@
    $html = $html -replace "</head>", "$css</head>"
}

# 4) Cambiar la línea que muestra la señal para incluir 1/6, 2/6, etc.
$pattern = "\$\('sigBig'\)\.textContent=a\.s==='W'\?'No hay confirmaci.{0,20} suficiente':'Se.{0,20}al '\+\(a\.s==='B'\?'BANCA':'JUGADOR'\);"

$replacement = @'
if(a.s==='W'){
  $('sigBig').textContent='No hay confirmación suficiente';
}else{
  const signalName=a.s==='B'?'BANCA':'JUGADOR';
  const currentRound=pendingSignal
    ? Math.min((pendingSignal.round||0)+1,MAX_SIGNAL_ROUNDS)
    : 1;
  $('sigBig').innerHTML=`Señal ${signalName} <span class="signal-round">${currentRound}/${MAX_SIGNAL_ROUNDS}</span>`;
}
'@

if ($html -match $pattern) {
    $html = [regex]::Replace($html, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $replacement }, 1)
    Write-Host "CONTADOR 1/6 INSTALADO" -ForegroundColor Green
} elseif ($html -match "signal-round") {
    Write-Host "EL CONTADOR YA ESTABA INSTALADO" -ForegroundColor Yellow
} else {
    Write-Host "NO ENCONTRE LA LINEA sigBig. NO SE MODIFICO EL ARCHIVO." -ForegroundColor Red
    Write-Host "La copia de seguridad sigue disponible." -ForegroundColor Yellow
    exit 2
}

# 5) Guardar
[System.IO.File]::WriteAllText($file, $html, [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " BACCATRACK: CONTADOR DE RONDAS INSTALADO" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "1/6 -> señal nueva"
Write-Host "2/6 -> perdió la primera ronda"
Write-Host "3/6 -> perdió dos rondas"
Write-Host "..."
Write-Host "6/6 -> ultima ronda"
Write-Host ""
Write-Host "Ahora ve al navegador y presiona CTRL + F5." -ForegroundColor Yellow
Write-Host "Servidor: http://localhost:3000" -ForegroundColor Yellow
