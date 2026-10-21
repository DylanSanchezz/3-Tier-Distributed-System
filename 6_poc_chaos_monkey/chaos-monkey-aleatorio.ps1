Write-Host "================================================================" -ForegroundColor Red
Write-Host "   CHAOS MONKEY EN VIVO (SELECCION ALEATORIA DE VICTIMAS)       " -ForegroundColor Red
Write-Host "   Dejando exactamente 1 nodo vivo al azar en cada capa         " -ForegroundColor Red
Write-Host "================================================================" -ForegroundColor Red

Write-Host "[1/4] Restaurando cluster completo antes del ataque..." -ForegroundColor Cyan
docker compose start | Out-Null
Start-Sleep -Seconds 5

Write-Host "[2/4] Blindando quorum en galera1 (MariaDB 11.4)..." -ForegroundColor Cyan
docker exec distributed-three-tier-galera1-1 mariadb -u root -pchange-this-root-password -e "SET GLOBAL wsrep_provider_pc_bootstrap=ON; SET GLOBAL wsrep_provider_pc_ignore_quorum=ON; SET GLOBAL wsrep_provider_pc_ignore_sb=ON;"

$webs = @("web1", "web2", "web3") | Get-Random -Count 3
$apps = @("app1", "app2", "app3") | Get-Random -Count 3
$killWebs = @("distributed-three-tier-$($webs[0])-1", "distributed-three-tier-$($webs[1])-1")
$surviveWeb = $webs[2]

$killApps = @("distributed-three-tier-$($apps[0])-1", "distributed-three-tier-$($apps[1])-1")
$surviveApp = $apps[2]

$presChoice = @("master", "backup") | Get-Random
$appLbChoice = @("master", "backup") | Get-Random

$killLBs = @(
  "distributed-three-tier-presentation-lb-$presChoice-1",
  "distributed-three-tier-presentation-keepalived-$presChoice-1",
  "distributed-three-tier-application-lb-$appLbChoice-1",
  "distributed-three-tier-application-keepalived-$appLbChoice-1"
)
$killDBs = @("distributed-three-tier-galera2-1", "distributed-three-tier-galera3-1")

Write-Host "`n[3/4] CHAOS MONKEY ATACANDO NODOS AL AZAR:" -ForegroundColor Yellow
Write-Host "  -> Matando Webs: $($webs[0]), $($webs[1])  (Sobrevive: $surviveWeb)" -ForegroundColor Red
Write-Host "  -> Matando Apps: $($apps[0]), $($apps[1])  (Sobrevive: $surviveApp)" -ForegroundColor Red
Write-Host "  -> Matando LBs : presentation-lb-$presChoice, application-lb-$appLbChoice" -ForegroundColor Red
Write-Host "  -> Matando DBs : galera2, galera3  (Sobrevive: galera1)" -ForegroundColor Red

$allVictims = $killWebs + $killApps + $killLBs + $killDBs
docker stop $allVictims | Out-Null
Start-Sleep -Seconds 5

Write-Host "`n[4/4] Limpiando cache de Redis y verificando supervivencia del sistema..." -ForegroundColor Cyan
curl.exe -s -X POST http://localhost/api/cache/clear | Out-Null
$pageTitle = (curl.exe -s http://localhost/ | Select-String "<h1>").Line.Trim()
$traceProd = (curl.exe -s -i http://localhost/api/products/cheapest | Select-String "x-request-trace").Line.Trim()
$traceRev  = (curl.exe -s -i http://localhost/api/products/ST-001/reviews | Select-String "x-request-trace").Line.Trim()

Write-Host "`n================ RESULTADO DE SUPERVIVENCIA ================" -ForegroundColor Green
Write-Host "Nodo Web Respondiente : $pageTitle" -ForegroundColor Green
Write-Host "Traza Catalogo (SQL)  : $traceProd" -ForegroundColor Green
Write-Host "Traza Resenas (Mongo) : $traceRev" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green

