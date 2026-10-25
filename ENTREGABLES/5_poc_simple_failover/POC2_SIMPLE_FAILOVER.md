# PoC 2: Pruebas de Alta Disponibilidad y Failover (`TEST-PLAN.md` Punto 3)

## Objetivo
Demostrar cómo cada componente de las **3 capas** (incluyendo los antiguos puntos únicos de fallo `galera1`, `redis` y `mongodb` corregidos según `ToDo.md` puntos 2 y 3) conmuta automáticamente sin interrumpir el servicio.

---

## 1. Failover de VIP Interna (Capa de Aplicación — `172.31.0.250`)
* **Acción Manual en Docker Desktop:** Detener `application-lb-master` y `application-keepalived-master`.
* **Resultado Verificado:** En `< 3 s`, `application-keepalived-backup` promueve su estado VRRP y toma la VIP `172.31.0.250`. La traza de `http://localhost` cambia a **`application-lb-backup`** rotando entre `app1`, `app2` y `app3`. Al volver a encender el master, ocurre *failback* limpio sin *flapping*.

---

## 2. Failover de VIP Externa (Capa de Presentación — `172.30.0.250` + Ruta `:8080`)
* **Acción Manual en Docker Desktop:** Detener `presentation-lb-master`, `presentation-keepalived-master` y `web1`.
* **Resultado Verificado:** `presentation-keepalived-backup` toma la VIP `172.30.0.250` (y mantiene abierta la ruta directa `http://localhost:8080`). El tráfico web rota únicamente entre `webnode2` y `webnode3` con `0` errores.

---

## 3. Failover de `galera1` (Antes *Expected to Fail*, Ahora **100% Superado** — `ToDo 3.1–3.3`)
* **Acción Manual en Docker Desktop:** Detener directamente **`galera1`** y presionar **"Clear Redis catalog cache"** en `http://localhost`.
* **Resultado Real Capturado:**
  * `database-lb` detecta la caída de `galera1` en `< 4 s` (visible en rojo en `http://localhost:8404/stats`).
  * El endpoint de escritura (`:3306`) promueve automáticamente a **`galera2`** (`"writePrimary": "galera2"` en `/api/health`).
  * El pool de lectura (`:3307`) balancea las consultas en Round-Robin entre **`galera2`** y **`galera3`**:
    ```text
    HTTP 200 | Trace: presentation-lb-master -> webnode1 -> application-lb-master -> app2 -> redis-ha (cache miss) -> database-lb:read (galera3) -> redis-ha (cache write)
    HTTP 200 | Trace: presentation-lb-master -> webnode2 -> application-lb-master -> app1 -> redis-ha (cache miss) -> database-lb:read (galera2) -> redis-ha (cache write)
    ```

---

## 4. Failover de Redis Master y Degradación Elegante sin Redis (`ToDo 2.2` y `2.3`)
* **Caso 4A — Apagar `redis-master`:**
  * `database-lb:6379` detecta la falta de `+PONG` y conmuta automáticamente hacia **`redis-replica`** (además monitoreado por `redis-sentinel`), conservando `cache write` y `cache hit` sin errores.
* **Caso 4B — Apagar AMBOS (`redis-master` y `redis-replica`):**
  * La aplicación detecta instantáneamente `redis.isReady === false` y aplica la política de **caché desechable**, consultando directamente a Galera en `< 45 ms` (`450.23 req/s`) sin arrojar ningún error `500`:
    ```text
    HTTP 200 | Trace: presentation-lb-master -> webnode2 -> application-lb-master -> app1 -> redis-ha (disposable fallback) -> database-lb:read (galera1)
    ```

---

## 5. Failover de MongoDB Primary (`mongo1`) en Replica Set `rs0` (`ToDo 2.1`)
* **Acción Manual en Docker Desktop:** Detener **`mongo1`** (nodo `PRIMARY` inicial con prioridad 2).
* **Resultado Real Capturado:**
  * Las lecturas `GET /api/products/ST-001/reviews` siguen respondiendo de inmediato desde los nodos secundarios gracias a `readPreference=secondaryPreferred`:
    ```text
    HTTP 200 | Trace: presentation-lb-master -> webnode1 -> application-lb-master -> app1 -> mongodb-rs0 (mongo3)
    ```
  * En ~6–8 segundos, `mongo2` y `mongo3` alcanzan quórum (`2/3`) y eligen automáticamente un nuevo **`PRIMARY`** (`mongo2`), permitiendo incluso **crear nuevas reseñas (`POST`) mientras `mongo1` está apagado**:
    ```text
    HTTP 201 | Trace: presentation-lb-master -> webnode2 -> application-lb-master -> app2 -> database-lb:write (galera1) -> mongodb-rs0:primary (mongo2)
    ```
