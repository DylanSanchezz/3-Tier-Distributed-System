# Tarea #995 — Sistema Distribuido de 3 Capas en Alta Disponibilidad (HA)

## 1. Descripción General de la Arquitectura

Este proyecto implementa una arquitectura distribuida de **3 capas (Presentación, Aplicación y Datos)** altamente disponible, resiliente y escalable mediante contenedores Docker, balanceadores **HAProxy 3.2** en configuración Maestro/Esclavo, **Keepalived (VRRP)** para IPs virtuales flotantes (VIPs), servidores web **Nginx**, microservicios API en **Node.js**, un clúster **MariaDB Galera** de 3 nodos, caché en **Redis**, almacenamiento documental en **MongoDB** y monitoreo activo en **Nagios Core**.

---

## 2. Componentes por Capa y Direccionamiento de Red

| Capa | Red Docker | Componente / Contenedor | Tecnología | Dirección IP / Puerto | Rol Arquitectónico |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Presentación** | `edge` (`172.30.0.0/24`) | `presentation-entry` | HAProxy 3.2 | Host `:80` $\rightarrow$ VIP `172.30.0.250:80` | Punto de entrada TCP hacia la VIP flotante |
| **Presentación** | `edge` (`172.30.0.0/24`) | `presentation-lb-master` + `keepalived-master` | HAProxy + Keepalived | `172.30.0.11:80` (VIP `172.30.0.250`, Prio `110`) | Balanceador HTTP Maestro de Presentación |
| **Presentación** | `edge` (`172.30.0.0/24`) | `presentation-lb-backup` + `keepalived-backup` | HAProxy + Keepalived | `172.30.0.12:80` (Host `:8080:80`, Prio `100`) | Balanceador HTTP Backup + Ruta de escape `:8080` |
| **Presentación** | `edge` + `application` | `web1`, `web2`, `web3` | Nginx Alpine | `:80` (`webnode1`, `webnode2`, `webnode3`) | Nodos Web estáticos y Reverse Proxy hacia `/api/` |
| **Aplicación** | `application` (`172.31.0.0/24`) | `application-lb-master` + `keepalived-master` | HAProxy + Keepalived | `172.31.0.11:8080` (VIP `172.31.0.250`, Prio `110`) | Balanceador Interno Maestro de API |
| **Aplicación** | `application` (`172.31.0.0/24`) | `application-lb-backup` + `keepalived-backup` | HAProxy + Keepalived | `172.31.0.12:8080` (VIP `172.31.0.250`, Prio `100`) | Balanceador Interno Backup de API |
| **Aplicación** | `application` + `database` | `app1`, `app2`, `app3` | Node.js 22 Alpine | `:8080` | Nodos de API REST (`/products/cheapest`, `/reviews`) |
| **Datos** | `database` (Aislada) | `galera1`, `galera2`, `galera3` | MariaDB Galera 11.4 | `:3306`, `:4567`, `:4568`, `:4444` | Clúster SQL Multi-Master Síncrono (Catálogo) |
| **Datos** | `database` (Aislada) | `redis` | Redis 7 Alpine | `:6379` | Caché en memoria (`store:products:cheapest`, TTL 60s) |
| **Datos** | `database` (Aislada) | `mongodb` | MongoDB 8 | `:27017` | Base de datos NoSQL para reseñas (`product_reviews`) |
| **Monitoreo** | `edge` + `app` + `db` | `nagios` | Nagios Core 4.5 | Host `:8088:80` | Monitoreo de 15 Hosts y 15 Servicios (Hard State $\le 1$ min) |

---

## 3. Cumplimiento de Objetivos Arquitectónicos

1. **Alta Disponibilidad (HA):**
   - Implementación de **Keepalived VRRP Unicast** en las capas de Presentación (`VIP 172.30.0.250`) y Aplicación (`VIP 172.31.0.250`). Si el balanceador `MASTER` cae, el nodo `BACKUP` asume la IP virtual automáticamente en $< 3$ segundos sin intervención humana.
   - Exposición adicional del puerto `8080:80` en `presentation-lb-backup` para sortear limitaciones de mapeo de puertos del host en Docker Desktop.
2. **Resiliencia:**
   - Configuración de healthchecks activos en HAProxy (`check inter 2s fall 2 rise 2`), `option redispatch` y `retries 3` para reencaminar peticiones instantáneamente si un nodo `web` o `app` deja de responder.
   - Capacidad comprobada de operar con **solo 1 nodo vivo por capa** (apagando el 66% de los nodos Web, el 66% de los nodos App, el 50% de los balanceadores y el 66% de los nodos Galera con recuperación de quórum `wsrep_provider_pc_ignore_quorum=ON`).
3. **Escalabilidad:**
   - Separación de pools Round-Robin por ruta mediante ACLs en HAProxy y cabeceras `Cache-Control: no-store`, distribuyendo la carga uniformemente entre `web1..3` y `app1..3` en cada petición.
   - Descarga de lecturas repetitivas de base de datos mediante **Redis Cache-Aside** (reduciendo la latencia y alcanzando **>730 peticiones/segundo** con 0% de errores).

---

## 4. Documentación de Pruebas de Concepto (PoCs)

### PoC 1: Load Testing con ApacheBench (`ab`)

Se ejecutó una prueba de estrés con **1,000 peticiones** y un nivel de **concurrencia de 50 clientes simultáneos** contra el endpoint de catálogo (`/api/products/cheapest`) a través de la VIP de presentación (`172.30.0.250`).

* **Comando ejecutado:**
  ```powershell
  docker run --rm --network distributed-three-tier_edge httpd:2.4-alpine ab -n 1000 -c 50 http://172.30.0.250/api/products/cheapest
  ```
* **Resultados Reales Obtenidos:**
  * **Complete requests:** `1000`
  * **Failed requests:** `0` (0% de pérdida)
  * **Requests per second:** `730.59 [#/sec] (mean)`
  * **Time per request (mean):** `68.438 [ms]`
  * **Time per request (concurrent mean):** `1.369 [ms]`
  * **Percentil 50% (Mediana):** `59 ms` | **Percentil 95%:** `145 ms` | **Percentil 99%:** `165 ms`

---

### PoC 2: Simple Failover Test

Prueba enfocada en demostrar la conmutación automática (failover) de un componente crítico individual sin interrupción del servicio:

1. **Caso 2A — Failover de VIP Interna (`application-lb-master`):**
   * Se detiene `application-lb-master` y `application-keepalived-master`:
     ```powershell
     docker stop distributed-three-tier-application-lb-master-1 distributed-three-tier-application-keepalived-master-1
     ```
   * **Resultado:** `application-keepalived-backup` detecta la ausencia de anuncios VRRP de prioridad `110`, se promueve a `MASTER` y toma la VIP `172.31.0.250`. La traza de la tienda cambia automáticamente de `application-lb-master` a `application-lb-backup`.
2. **Caso 2B — Failover de Nodo Web y LB de Presentación:**
   * Se detiene `presentation-lb-master`, `presentation-keepalived-master` y `web1`:
     ```powershell
     docker stop distributed-three-tier-presentation-lb-master-1 distributed-three-tier-presentation-keepalived-master-1 distributed-three-tier-web1-1
     ```
   * **Resultado:** La VIP `172.30.0.250` pasa a `presentation-lb-backup` y el tráfico se balancea únicamente entre `webnode2` y `webnode3` sin errores HTTP.

---

### PoC 3: Chaos Engineering con Chaos Monkey (Supervivencia con 1 Nodo por Capa)

Se validaron **dos escenarios deterministas opuestos** y un **script automatizado Chaos Monkey (`chaos-monkey-aleatorio.ps1`)** que abate aleatoriamente el 66% de cada capa dejando únicamente 1 nodo vivo por nivel:

* **Preparación de Quórum en Galera 11.4:**
  ```powershell
  docker exec -it distributed-three-tier-galera1-1 mariadb -u root -pchange-this-root-password -e "SET GLOBAL wsrep_provider_pc_bootstrap=ON; SET GLOBAL wsrep_provider_pc_ignore_quorum=ON; SET GLOBAL wsrep_provider_pc_ignore_sb=ON;"
  ```
* **Prueba Caos A (Sobreviven `web3`, `application-lb-backup`, `app1`, `galera1`):**
  ```powershell
  docker stop distributed-three-tier-web1-1 distributed-three-tier-web2-1 distributed-three-tier-app2-1 distributed-three-tier-app3-1 distributed-three-tier-application-lb-master-1 distributed-three-tier-application-keepalived-master-1 distributed-three-tier-galera2-1 distributed-three-tier-galera3-1
  ```
  * **Traza verificada tras limpiar caché de Redis:**
    `presentation-lb-master -> webnode3 -> application-lb-backup -> app1 -> redis (cache miss) -> galera1 -> redis (cache write)`
* **Prueba Caos B (Sobreviven `presentation-lb-backup`, `web2`, `application-lb-master`, `app2`, `galera1`):**
  ```powershell
  docker stop distributed-three-tier-web3-1 distributed-three-tier-web1-1 distributed-three-tier-app3-1 distributed-three-tier-app1-1 distributed-three-tier-presentation-lb-master-1 distributed-three-tier-presentation-keepalived-master-1 distributed-three-tier-galera2-1 distributed-three-tier-galera3-1
  ```
  * **Traza verificada tras limpiar caché de Redis:**
    `presentation-lb-backup -> webnode2 -> application-lb-master -> app2 -> redis (cache miss) -> galera1 -> redis (cache write)`
* **Detección en Nagios (`http://localhost:8088/nagios`):**
  Todos los nodos detenidos pasan a estado **Hard State (`DOWN` / `CRITICAL` en color rojo) en $\le 1$ minuto**.

