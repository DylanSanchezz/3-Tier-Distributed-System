Write-Host "================================================================" -ForegroundColor Red
Write-Host "   CHAOS MONKEY V2 EN VIVO (SELECCION ALEATORIA EN LAS 3 CAPAS) " -ForegroundColor Red
Write-Host "   Incluye failover de Galera (cualquier nodo), Mongo rs0 y Redis" -ForegroundColor Red
Write-Host "================================================================" -ForegroundColor Red

Write-Host "[1/3] Restaurando cluster completo antes del ataque..." -ForegroundColor Cyan
docker compose start | Out-Null
Start-Sleep -Seconds 8

$webs = @("web1", "web2", "web3") | Get-Random -Count 3
$apps = @("app1", "app2", "app3") | Get-Random -Count 3
$galeras = @("galera1", "galera2", "galera3") | Get-Random -Count 3
$mongos = @("mongo1", "mongo2", "mongo3") | Get-Random -Count 3
$redisVictim = @("redis-master", "redis-replica") | Get-Random
$presChoice = @("master", "backup") | Get-Random
$appLbChoice = @("master", "backup") | Get-Random

$killList = @(
  "distributed-three-tier-$($webs[0])-1",
  "distributed-three-tier-$($webs[1])-1",
  "distributed-three-tier-$($apps[0])-1",
  "distributed-three-tier-$($apps[1])-1",
  "distributed-three-tier-presentation-lb-$presChoice-1",
  "distributed-three-tier-presentation-keepalived-$presChoice-1",
  "distributed-three-tier-application-lb-$appLbChoice-1",
  "distributed-three-tier-application-keepalived-$appLbChoice-1",
  "distributed-three-tier-$($galeras[0])-1",
  "distributed-three-tier-$($galeras[1])-1",
  "distributed-three-tier-$($mongos[0])-1",
  "distributed-three-tier-$redisVictim-1"
)

Write-Host "`n[2/3] CHAOS MONKEY ATACANDO 12 CONTENEDORES AL AZAR:" -ForegroundColor Yellow
Write-Host "  -> Matando Webs   : $($webs[0]), $($webs[1])  (Sobrevive: $($webs[2]))" -ForegroundColor Red
Write-Host "  -> Matando Apps   : $($apps[0]), $($apps[1])  (Sobrevive: $($apps[2]))" -ForegroundColor Red
Write-Host "  -> Matando LBs    : presentation-lb-$presChoice, application-lb-$appLbChoice" -ForegroundColor Red
Write-Host "  -> Matando Galera : $($galeras[0]), $($galeras[1])  (Sobrevive: $($galeras[2]) via database-lb)" -ForegroundColor Red
Write-Host "  -> Matando Mongo  : $($mongos[0])  (Sobreviven en rs0: $($mongos[1]), $($mongos[2]))" -ForegroundColor Red
Write-Host "  -> Matando Redis  : $redisVictim" -ForegroundColor Red

docker stop $killList | Out-Null
Start-Sleep -Seconds 8

Write-Host "`n[3/3] Limpiando cache de Redis y verificando supervivencia del sistema..." -ForegroundColor Cyan
curl.exe -s -X POST http://localhost/api/cache/clear | Out-Null
$pageTitle = (curl.exe -s http://localhost/ | Select-String "<h1>").Line.Trim()
$traceProd = (curl.exe -s -i http://localhost/api/products/cheapest | Select-String "x-request-trace").Line.Trim()
$traceRev  = (curl.exe -s -i http://localhost/api/products/ST-001/reviews | Select-String "x-request-trace").Line.Trim()

Write-Host "`n================ RESULTADO DE SUPERVIVENCIA ================" -ForegroundColor Green
Write-Host "Nodo Web Respondiente : $pageTitle" -ForegroundColor Green
Write-Host "Traza Catalogo (SQL)  : $traceProd" -ForegroundColor Green
Write-Host "Traza Resenas (Mongo) : $traceRev" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
