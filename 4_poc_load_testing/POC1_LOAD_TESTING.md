# PoC 1: Load Testing con ApacheBench (`ab`)

## Objetivo
Evaluar la capacidad de respuesta, escalabilidad horizontal y distribución de carga de la arquitectura de 3 capas bajo tráfico concurrente intensivo.

## Comando para Ejecutar la Prueba en Vivo frente al Profesor
Puedes ejecutar el script `run-load-test.ps1` o correr directamente este comando en PowerShell (no requiere instalar nada en Windows, utiliza la imagen oficial `httpd:2.4-alpine` conectada a la red `edge`):

```powershell
docker run --rm --network distributed-three-tier_edge httpd:2.4-alpine ab -n 1000 -c 50 http://172.30.0.250/api/products/cheapest
```

## Resultados Reales Capturados (`resultados_ab_reales.txt`)

| Métrica | Valor Obtenido | Interpretación |
| :--- | :--- | :--- |
| **Total de Peticiones (`-n`)** | `1000` | Mil consultas completas al endpoint `/api/products/cheapest` |
| **Concurrencia (`-c`)** | `50` | 50 usuarios concurrentes simultáneos |
| **Peticiones Fallidas** | **`0` (0%)** | Alta disponibilidad total sin pérdida de paquetes ni errores `5xx` |
| **Rendimiento (`Requests/sec`)** | **`730.59 req/seg`** | Alto throughput gracias al balanceo Round-Robin y caché Redis |
| **Tiempo total de la prueba** | `1.369 segundos` | Las 1,000 peticiones se resolvieron en ~1.37 segundos |
| **Latencia Media por lote** | `68.438 ms` | Respuesta rápida de extremo a extremo (LB -> Web -> LB -> App -> Redis/DB) |
| **Percentil 50% (Mediana)** | `59 ms` | La mitad de las peticiones respondieron en menos de 59 ms |
| **Percentil 99%** | `165 ms` | El 99% de las peticiones respondieron en menos de 165 ms |

