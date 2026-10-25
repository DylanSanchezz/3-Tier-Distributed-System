# PoC 3: Chaos Engineering — Fallas Múltiples, Compuestas y Recuperación (`TEST-PLAN.md` Punto 4)

## Hipótesis de Estado Estable (*Steady-State Hypothesis*)
> *"Ante la caída abrupta y simultánea de hasta dos tercios de los nodos stateless (Web/App), la mitad de los balanceadores HAProxy/Keepalived, el nodo primario de Galera (`galera1`), el nodo primario de MongoDB (`mongo1`) y el nodo maestro de Redis (`redis-master`) bajo carga concurrente y vaciado de caché, el sistema mantiene una disponibilidad $\ge 99.9\%$ (`0` errores `5xx`) y una latencia `p95 < 500 ms`."*

---

## 1. Experimento A: Falla Compuesta Masiva (*Compound Fault*: Carga + 9 Contenedores Caídos + Cache Flush)

Se ejecutó simultáneamente:
1. Apagado de **9 contenedores críticos en las 3 capas**: `web1`, `web2`, `app2`, `app3`, `application-lb-master`, `application-keepalived-master`, `galera1`, `mongo1` y `redis-master`.
2. Inyección de vaciado de caché (`POST /api/cache/clear`).
3. Ráfaga concurrente con ApacheBench (`ab -n 300 -c 15`).

* **Resultados Reales Medidos durante el Apagón de 9 Contenedores:**
  * **Complete requests:** `300`
  * **Failed requests:** **`0` (100% de disponibilidad)**
  * **Requests per second:** **`862.11 req/seg`**
  * **Latencia `p50`:** `16 ms` | **`p95`:** **`21 ms`** | **`p99`:** `27 ms` (muy por debajo del umbral de `500 ms` de la hipótesis).
  * **Detección en Nagios (`http://localhost:8088/nagios`):** En $\le 60\text{ s}$ Nagios reportó exactamente los hosts y servicios detenidos en estado **`DOWN` / `CRITICAL` (Rojo)** con `0` estados `UNKNOWN`.

---

## 2. Experimento B: Falla de Recuperación Total en Frío (*Recovery Fault*)

Se detuvieron absolutamente **todos los 25 contenedores** del proyecto (`docker compose stop`) y se volvieron a iniciar en frío (`docker compose start`):
* **Resultado Verificado:**
  * Gracias a `MARIADB_GALERA_FORCE_SAFETOBOOTSTRAP: "yes"` en `galera1` y a la limpieza automática de archivos PID en `keepalived` y `nagios`, el clúster completo arrancó sin errores de dependencia.
  * `wsrep_cluster_size` regresó automáticamente a **`3`**, `rs0` restableció sus 3 miembros (`1 PRIMARY + 2 SECONDARY`) y todos los endpoints (`/api/health`, `/api/products/cheapest`, `/api/products/ST-001/reviews`, `:8404/stats`, `:8088/nagios`) respondieron `HTTP 200 OK`.

---

## 3. Script Automatizado Estilo Netflix (`chaos-monkey-aleatorio.ps1`)
En esta misma carpeta se incluye `chaos-monkey-aleatorio.ps1` actualizado a la arquitectura V2 (selecciona y apaga al azar 2 nodos Web, 2 nodos App, 1 LB de Presentación, 1 LB de Aplicación, **cualesquiera 2 nodos Galera incluyendo `galera1`**, 1 nodo MongoDB `rs0` y 1 nodo Redis HA):

```powershell
powershell -ExecutionPolicy Bypass -File .\ENTREGABLES\6_poc_chaos_monkey\chaos-monkey-aleatorio.ps1
```
