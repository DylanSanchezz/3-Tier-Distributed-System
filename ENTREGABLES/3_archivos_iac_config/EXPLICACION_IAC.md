# Entregable 3: Archivos de Infraestructura como Código (IaC) y Configuración (V2 — ToDo 2 & 3 Completos)

En esta carpeta se concentran todos los archivos de configuración de infraestructura y enrutamiento actualizados para cumplir al 100% con los objetivos de **Resiliencia, Alta Disponibilidad, Escalabilidad** y las mejoras solicitadas en **`ToDo.md` (Puntos 2.1, 2.2, 2.3 y Todo el Punto 3)**:

1. **`docker-compose.yml` y `.env.example`**:
   - Define los **25 servicios** distribuidos en 3 redes segmentadas (`edge` `172.30.0.0/24`, `application` `172.31.0.0/24` interna, `database` interna).
   - **ToDo 2.1 (MongoDB Replica Set):** Despliega 3 nodos `mongo1`, `mongo2`, `mongo3` (`mongo:8 --replSet rs0 --keyFile`) con inicialización automática del Replica Set y elección automática de nodo `PRIMARY`.
   - **ToDo 2.2 y 2.3 (Redis HA + Caché Desechable):** Despliega `redis-master` + `redis-replica` con persistencia AOF (`--appendonly yes`), monitoreados por `redis-sentinel` y balanceados por `database-lb:6379`.
   - **ToDo 3.1–3.4 (Enrutamiento Cluster-Aware para Galera):** Despliega `database-lb` (`8404:8404`) eliminando la conexión directa a `galera1`, configura `--max-connections=300` en `galera1..3` y `MARIADB_GALERA_FORCE_SAFETOBOOTSTRAP=yes` para arranque resiliente tras apagados totales.
   - Mapeo de escape `8080:80` en `presentation-lb-backup` y limpieza automática de archivos PID en `nagios` (`8088:80`) y `keepalived`.

2. **`haproxy/`**:
   - **`database-lb.cfg` (NUEVO — ToDo 2.2 y 3.1–3.4):**
     - `:3306` (`galera_write`): Enrutamiento **Single-Writer Primary** (`galera1` activo + `galera2` y `galera3` en `backup` automático) para evitar interbloqueos WSREP por escritura simultánea y soportar la caída de `galera1` con cero caída.
     - `:3307` (`galera_read`): Pool **Round-Robin** de lecturas distribuidas entre `galera1`, `galera2` y `galera3` (`maxconn 90` por nodo).
     - `:6379` (`redis_ha`): Enrutamiento **Redis HA** con healthcheck de capa 7 (`PING` $\rightarrow$ `+PONG`) entre `redis-master` y `redis-replica`.
     - `:8404/stats`: Dashboard web en tiempo real de salud y sesiones SQL/Redis.
   - `presentation-entry.cfg`, `presentation-master.cfg`, `presentation-backup.cfg`: Balanceo Round-Robin con ACLs por ruta, `option redispatch`, `retries 3` y `Cache-Control: no-store`.
   - `application-master.cfg` y `application-backup.cfg`: Balanceo Round-Robin hacia `app1`, `app2` y `app3` con `option httpchk GET /health`.

3. **`application/` (`index.js`, `init-db.js`)**:
   - **Read/Write Splitting (ToDo 3.3):** Separación de pools `readPool` (`database-lb:3307`) para consultas `SELECT` y `writePool` (`database-lb:3306`) para validaciones/operaciones de escritura.
   - **Límites de Connection Pool Escalables (ToDo 3.4):** `DB_READ_POOL_LIMIT=5`, `DB_WRITE_POOL_LIMIT=2`, `DB_POOL_QUEUE_LIMIT=50` por réplica API ($3 \times 7 = 21$ conexiones máximas frente a `300` en MariaDB, permitiendo escalar hasta ~40 réplicas sin saturar Galera).
   - **MongoDB Replica Set Driver (ToDo 2.1):** Conexión `replicaSet=rs0&readPreference=secondaryPreferred` reportando el miembro activo (`mongo1`, `mongo2` o `mongo3`) en `X-Request-Trace`.
   - **Redis como Caché Desechable (ToDo 2.3):** Patrón *Cache-Aside* con fallback transparente directo a MariaDB Galera (cero errores `500` incluso si se apagan todos los contenedores de Redis).

4. **`keepalived/`**:
   - VRRP Unicast para VIPs `172.30.0.250` (Presentación) y `172.31.0.250` (Aplicación) con limpieza de PID al reiniciar.

5. **`nagios/architecture.cfg`**:
   - Monitoreo acelerado (`check_interval 1`, `retry_interval 1`, `max_check_attempts 1`, `negate -u CRITICAL`) para **19 Hosts y 19 Servicios** (incluyendo `database-lb`, `mongo1..3`, `redis-master`, `redis-replica` y `galera1..3`), marcando cualquier caída en `DOWN` / `CRITICAL` (Rojo) en $\le 1\text{ min}$.

6. **`ToDo.md` y `TEST-PLAN.md`**:
   - Checklist de arquitectura completado y plan integral de pruebas (Puntos 1 al 5).
