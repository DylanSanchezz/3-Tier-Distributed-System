# Entregable 3: Archivos de Infraestructura como Código (IaC) y Configuración

En esta carpeta se concentran todos los archivos de configuración de infraestructura ajustados para cumplir con los objetivos de **Resiliencia, Alta Disponibilidad y Escalabilidad**:

1. **`docker-compose.yml`**:
   - Define los 21 contenedores distribuidos en 3 redes aisladas (`edge`, `application`, `database`).
   - Incluye el mapeo de puerto de escape `8080:80` en `presentation-lb-backup` para failover en Docker Desktop.
2. **`haproxy/`**:
   - `presentation-entry.cfg`: Entrada TCP hacia la VIP flotante `172.30.0.250:80`.
   - `presentation-master.cfg` y `presentation-backup.cfg`: Balanceo Round-Robin con ACLs separadas por ruta, `option redispatch`, `retries 3`, healthchecks cada `2s` y `Cache-Control: no-store`.
   - `application-master.cfg` y `application-backup.cfg`: Balanceo Round-Robin hacia `app1`, `app2` y `app3` con `option httpchk GET /health` y `option redispatch`.
3. **`keepalived/`**:
   - `presentation-master.conf` y `presentation-backup.conf`: Configuración VRRP Unicast para la VIP `172.30.0.250` (`virtual_router_id 51`).
   - `application-master.conf` y `application-backup.conf`: Configuración VRRP Unicast para la VIP `172.31.0.250` (`virtual_router_id 52`).
   - `Dockerfile` y `check-haproxy.sh`: Imagen Alpine con limpieza de archivos PID (`/run/keepalived*`) y script de rastreo TCP.
4. **`nagios/architecture.cfg`**:
   - Monitoreo activo de 15 Hosts y 15 Servicios con `check_interval 1`, `retry_interval 1`, `max_check_attempts 1` y `negate -u CRITICAL` para transición a estado `DOWN` / `CRITICAL` (Rojo) en $\le 1$ minuto.
5. **`web/nginx.conf`**:
   - Reverse Proxy hacia la VIP interna `http://172.31.0.250:8080/` e inyección de cabeceras `X-Web-Node`, `X-Presentation-LB` y `Cache-Control: no-store`.

