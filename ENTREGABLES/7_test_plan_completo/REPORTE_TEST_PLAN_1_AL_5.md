# Reporte Integral de Ejecución: `TEST-PLAN.md` (Puntos 1 al 5) y Mejoras `ToDo.md`

Este documento presenta la evidencia técnica real de ejecución de los **puntos 1 al 5 de `TEST-PLAN.md`** sobre la arquitectura distribuida mejorada (**Tarea #995 V2**), tras implementar los requerimientos del profesor:
- **`ToDo.md` 2.1:** MongoDB Replica Set de 3 nodos (`rs0`: `mongo1`, `mongo2`, `mongo3`).
- **`ToDo.md` 2.2 y 2.3:** Redis en Alta Disponibilidad (`redis-master` + `redis-replica` + `redis-sentinel` + `database-lb:6379`) operando como caché desechable (*Disposable Cache-Aside*) con fallback directo a MariaDB Galera (`0` errores `500`).
- **`ToDo.md` 3.1, 3.2, 3.3 y 3.4:** Eliminación del SPOF en `galera1`, proxy consciente del clúster `database-lb` (`http://localhost:8404/stats`), separación Lectura/Escritura (`:3306` Single-Writer con failover + `:3307` Round-Robin Read Pool) y dimensionamiento de pools de conexión (`DB_READ_POOL_LIMIT=5`, `DB_WRITE_POOL_LIMIT=2`, `max_connections=300`).

---

## Punto 1: Baseline y Chequeos Funcionales (Antes de Inyectar Fallos)

### 1.1 Salud de Todas las Capas y Clústeres
* **Servicios activos:** 24 contenedores en ejecución continua + `catalog-init` finalizado con código `0`.
* **Galera Cluster (`galera1..3`):**
  ```text
  wsrep_cluster_size         3
  wsrep_local_state_comment  Synced
  max_connections            300
  ```
* **MongoDB Replica Set (`rs0`):**
  ```json
  [
    {"name": "mongo1:27017", "stateStr": "PRIMARY", "health": 1},
    {"name": "mongo2:27017", "stateStr": "SECONDARY", "health": 1},
    {"name": "mongo3:27017", "stateStr": "SECONDARY", "health": 1}
  ]
  ```
* **Redis HA + Sentinel:** `role:master`, `connected_slaves:1`, `mymaster` monitoreado en `redis-master:6379`.
* **HAProxy `database-lb` (`http://localhost:8404/stats`):** `HTTP 200 OK` — backends `galera_write`, `galera_read` y `redis_ha` en estado `UP`.
* **Endpoint `/api/health`:**
  ```json
  {
    "status": "ok",
    "routing": {
      "readNode": "galera1",
      "writePrimary": "galera1",
      "pools": { "readPoolLimit": 5, "writePoolLimit": 2, "poolQueueLimit": 50 }
    }
  }
  ```

### 1.2 Verificación de Balanceo Round-Robin y Consistencia de Datos
* **Rotación en Lecturas de Catálogo (limpiando caché entre peticiones):**
  ```text
  [ColdRead-1] HTTP 200 | Trace: presentation-lb-master -> webnode2 -> application-lb-master -> app1 -> redis-ha (cache miss) -> database-lb:read (galera1) -> redis-ha (cache write)
  [ColdRead-2] HTTP 200 | Trace: presentation-lb-master -> webnode3 -> application-lb-master -> app3 -> redis-ha (cache miss) -> database-lb:read (galera1) -> redis-ha (cache write)
  [ColdRead-3] HTTP 200 | Trace: presentation-lb-master -> webnode1 -> application-lb-master -> app2 -> redis-ha (cache miss) -> database-lb:read (galera3) -> redis-ha (cache write)
  ```
* **Rotación en Lecturas de Reseñas MongoDB (`readPreference=secondaryPreferred`):**
  ```text
  [ReviewRead-1] HTTP 200 | Trace: presentation-lb-master -> webnode3 -> application-lb-master -> app3 -> mongodb-rs0 (mongo3)
  [ReviewRead-2] HTTP 200 | Trace: presentation-lb-master -> webnode1 -> application-lb-master -> app1 -> mongodb-rs0 (mongo2)
  ```

---

## Punto 2: Pruebas de Rendimiento (`ab`, `Siege`, `JMeter`)

* **Metas SLO definidas:** Disponibilidad $\ge 99.9\%$ y latencia `p95 < 200 ms` bajo carga nominal.
* **Plan JMeter incluido:** [`test-plan-tarea995.jmx`](./test-plan-tarea995.jmx).

### 2.1 Matriz de Resultados de Rendimiento

| Prueba | Herramienta / Comando | Completadas | Fallidas | Throughput | `p50` | `p95` | `p99` | Evaluación SLO |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Smoke** | `ab -n 20 -c 2` | `20` | `0` (0%) | `191.59 req/s` | `6 ms` | **`37 ms`** | `37 ms` | Aprobado (`< 200 ms`) |
| **Load** | `ab -n 2000 -c 50` | `2000` | `0` (0%) | **`553.20 req/s`** | `79 ms` | **`174 ms`** | `244 ms` | Aprobado (`< 200 ms`) |
| **Stress** | `ab -n 3000 -c 150` | `3000` | `0` (0%) | **`727.64 req/s`** | `190 ms` | `328 ms` | `401 ms` | 100% Disponibilidad |
| **Spike** | `ab -n 2000 -c 250` | `2000` | `0` (0%) | `620.45 req/s` | `324 ms` | `658 ms` | `702 ms` | 0% Errores en pico súbito |
| **Cache ON** | `ab -n 500 -c 20` (Warm Redis) | `500` | `0` (0%) | **`713.92 req/s`** | `25 ms` | **`44 ms`** | `55 ms` | +58.5% Throughput |
| **Cache OFF** | `ab -n 500 -c 20` (Sin Redis $\rightarrow$ SQL) | `500` | `0` (0%) | `450.23 req/s` | `41 ms` | **`75 ms`** | `109 ms` | Degradación limpia sin 500s |
| **Capa 1 Directa** | `ab -n 1000 -c 50 http://web1/` | `1000` | `0` (0%) | `688.91 req/s` | `68 ms` | `110 ms` | `190 ms` | Nginx sin cuello de botella |
| **Capa 2 Directa** | `ab -n 1000 -c 50 http://app1:8080/...` | `1000` | `0` (0%) | `598.16 req/s` | `78 ms` | `127 ms` | `131 ms` | API Node.js escalable |

### 2.2 Uso de Recursos por Contenedor (`docker stats --no-stream`)
* Nodos `web1..3`: `~0.5% - 0.9% CPU`, `~14 MiB RAM`.
* Balanceadores HAProxy (`presentation-lb`, `application-lb`, `database-lb`): `~0.6% - 0.8% CPU`, `~79 - 83 MiB RAM`.
* Réplicas API `app1..3`: `~2.6% CPU`, `~105 MiB RAM`.
* Demonios Keepalived: `< 0.2% CPU`, `~1 MiB RAM`.

---

## Punto 3: Pruebas de Alta Disponibilidad (HA) y Failover

| Componente Atacado | Fallo Inyectado | Resultado Obtenido (V2) | Tiempo de Conmutación (MTTR) | Errores |
| :--- | :--- | :--- | :--- | :--- |
| **`presentation-lb-master`** | `stop` master + keepalived | VIP `172.30.0.250` migra a `presentation-lb-backup` (y puerto `:8080` disponible). Failback limpio al iniciar. | `~3 s` | `0` |
| **`application-lb-master`** | `stop` master + keepalived | VIP `172.31.0.250` migra a `application-lb-backup`. Traza cambia automáticamente. | `~3 s` | `0` |
| **1 o 2 nodos `web` / `app`** | `stop web1 web2 app2 app3` | HAProxy retira nodos caídos (`fall 2` $\times$ `2s`) y reenvía con `option redispatch`. | `< 4 s` | `0` |
| **`galera2` o `galera3`** | `stop galera2` | Clúster mantiene quórum nativo (`2/3`) y servicio continuo. | `Instantáneo` | `0` |
| **`galera1` (Antes SPOF)** | **`stop galera1`** | **`database-lb` conmuta `:3306` a `galera2` y balancea `:3307` en `galera2`/`galera3` (`HTTP 200 OK`).** | **`< 4 s`** | **`0`** |
| **Redis Master** | **`stop redis-master`** | **`database-lb:6379` conmuta a `redis-replica` manteniendo `cache write` y `cache hit`.** | **`< 4 s`** | **`0`** |
| **Todo Redis (Master + Replica)** | `stop redis-master redis-replica` | Política *Disposable Cache* activa: `app1..3` leen directo de Galera a `450 req/s` (`HTTP 200 OK`). | `< 0.4 s` | **`0` (Sin 500s)** |
| **MongoDB Primary (`mongo1`)** | **`stop mongo1`** | **`rs0` elige a `mongo2` como nuevo `PRIMARY`; lecturas `GET 200` y escrituras `POST 201` siguen operando.** | **`~6 - 8 s`** | **`0`** |

---

## Punto 4: Pruebas de Ingeniería del Caos (Chaos Engineering)

1. **Falla de Contenedores Aleatoria (`chaos-monkey-aleatorio.ps1`):**
   - Abate al azar 12 contenedores simultáneos en las 3 capas dejando el mínimo operativo por capa; la tienda y las reseñas responden `HTTP 200 OK`.
2. **Falla Compuesta (*Compound Fault*):**
   - **Hipótesis:** Disponibilidad $\ge 99\%$ y `p95 < 500 ms`.
   - **Inyección:** Apagado simultáneo de **9 contenedores** (`web1`, `web2`, `app2`, `app3`, `application-lb-master`, `application-keepalived-master`, `galera1`, `mongo1`, `redis-master`) + vaciado de caché `POST /api/cache/clear` + carga `ab -n 300 -c 15`.
   - **Resultado:** `300/300` peticiones completadas (**100% disponibilidad**), `862.11 req/s`, **`p95 = 21 ms`**. Hipótesis validada con holgura.
3. **Falla de Recuperación Completa (*Recovery Fault*):**
   - **Inyección:** `docker compose stop` (25 contenedores apagados) seguido de `docker compose start`.
   - **Resultado:** Re-bootstrap automático exitoso de `galera1` (`MARIADB_GALERA_FORCE_SAFETOBOOTSTRAP=yes`), reconexión de `galera2` y `galera3` (`wsrep_cluster_size = 3`), elección automática en `rs0` y limpieza de locks PID en `nagios` y `keepalived`.

---

## Punto 5: Observabilidad y Verificación de Alertas

* **Nagios Core (`http://localhost:8088/nagios`):**
  * Configuración verificada con `nagios -v`: **19 hosts y 19 servicios**, `0` errores.
  * Durante el experimento de caos compuesto, la API JSON de Nagios (`statusjson.cgi`) reportó todos los nodos detenidos en estado **`DOWN` / `CRITICAL` (Rojo)** y **`0` en estado `UNKNOWN`** gracias al wrapper `negate -u CRITICAL`.
  * **MTTD (*Mean Time To Detect*):** **$\le 60\text{ segundos}$** (`check_interval = 1`, `max_check_attempts = 1`).
* **HAProxy Database & Redis Stats (`http://localhost:8404/stats`):**
  * Muestra en tiempo real (refresco cada `3s`) la transición `UP` $\rightarrow$ `DOWN` y la activación de servidores `BACKUP` en `galera_write`, `galera_read` y `redis_ha`.
  * **MTTR (*Mean Time To Recover* por failover automático):** **`2 - 4 segundos`** en HAProxy/Keepalived y **`6 - 8 segundos`** en elección primaria de MongoDB `rs0`.
* **Consumo de Presupuesto de Error (*Error Budget Burn*):** **`0.00%`** en todas las corridas de carga y caos compuesto (`0` peticiones fallidas sobre más de `9,800` peticiones HTTP medidas).

