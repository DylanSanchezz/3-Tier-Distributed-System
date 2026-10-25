# 3-Tier Distributed System — High Availability, Cluster-Aware Routing & Resilience (V2)

Sistema distribuido de **3 capas (Presentación, Aplicación y Datos)** en Alta Disponibilidad (HA), Resiliencia y Escalabilidad (**25 contenedores**). Implementa una arquitectura multinodo sin puntos únicos de fallo en datos utilizando **HAProxy 3.2** (incluyendo proxy cluster-aware `database-lb` con *Read/Write Split*), **Keepalived (VRRP VIPs)**, **Nginx (x3)**, **Node.js API (x3)**, **MariaDB Galera Cluster (x3)**, **MongoDB 8 Replica Set `rs0` (x3)**, **Redis 7 HA + Sentinel** y monitoreo activo en **Nagios Core**, validada con el plan integral **[`TEST-PLAN.md`](./TEST-PLAN.md) (Puntos 1 al 5)**.

![Diagrama de Arquitectura V2](./ENTREGABLES/1_diagrama_arquitectura/diagrama_arquitectura_3_capas.jpg)

---

## 📄 Documentación Principal (Acceso Rápido)

* ✅ **[ToDo.md](./ToDo.md)**: Checklist de mejoras arquitectónicas completadas (**MongoDB Replica Set `2.1`**, **Redis HA + Disposable Cache `2.2` y `2.3`**, y **Enrutamiento Cluster-Aware de Galera `3.1–3.4`**).
* 🧪 **[REPORTE_TEST_PLAN_1_AL_5.md](./ENTREGABLES/7_test_plan_completo/REPORTE_TEST_PLAN_1_AL_5.md)**: Evidencia y resultados reales medidos de los **puntos 1 al 5** de [`TEST-PLAN.md`](./TEST-PLAN.md) (*Baseline, Performance `ab`/`Siege`/`JMeter`, HA Failover, Chaos Engineering y Observabilidad*).
* 📘 **[README_TAREA_995.md](./ENTREGABLES/2_documentacion_markdown/README_TAREA_995.md)**: Documentación general del entregable, desglose de topología por capa y justificación técnica de diseño.
* ⚙️ **[EXPLICACION_IAC.md](./ENTREGABLES/3_archivos_iac_config/EXPLICACION_IAC.md)**: Detalle técnico de la Infraestructura como Código (IaC), redes aisladas, *connection pools* y orquestación.

---

## 📂 Estructura de Entregables por Carpeta ([`ENTREGABLES/`](./ENTREGABLES/))

1. 📁 **[1_diagrama_arquitectura](./ENTREGABLES/1_diagrama_arquitectura/)**: Diagrama de arquitectura V2 en formato `.jpg` (`2100x1420`) y código fuente Mermaid para Lucidchart.
2. 📁 **[2_documentacion_markdown](./ENTREGABLES/2_documentacion_markdown/)**: Documentación técnica completa del sistema distribuido (`README_TAREA_995.md`).
3. 📁 **[3_archivos_iac_config](./ENTREGABLES/3_archivos_iac_config/)**: Copia consolidada de manifiestos `docker-compose.yml`, `.env.example`, `haproxy/database-lb.cfg`, `keepalived/`, `nagios/` y `application/`.
4. 📁 **[4_poc_load_testing](./ENTREGABLES/4_poc_load_testing/)**: Pruebas de rendimiento (`Smoke`, `Load`, `Stress`, `Spike`, comparativa Con/Sin Caché Redis y capacidad por capa) con ApacheBench (`ab`) y Siege.
5. 📁 **[5_poc_simple_failover](./ENTREGABLES/5_poc_simple_failover/)**: Pruebas de conmutación automática en VIPs Keepalived, caída de `galera1`, caída de `redis-master` (y apagado total de Redis) y elección primaria en MongoDB `rs0` al caer `mongo1`.
6. 📁 **[6_poc_chaos_monkey](./ENTREGABLES/6_poc_chaos_monkey/)**: Experimentos de Ingeniería del Caos (falla compuesta de 9 contenedores simultáneos bajo carga + recuperación total en frío + script `chaos-monkey-aleatorio.ps1`).
7. 📁 **[7_test_plan_completo](./ENTREGABLES/7_test_plan_completo/)**: Reporte maestro de los puntos 1 al 5 del `TEST-PLAN.md` y archivo ejecutable de Apache JMeter (`test-plan-tarea995.jmx`).

---

## 🚀 Ejecución Rápida en Local

1. Copiar variables de entorno:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Construir y levantar los 25 contenedores:
   ```powershell
   docker compose up --build -d
   ```
3. Accesos en el navegador:
   * **Tienda Principal (VIP Presentación):** `http://localhost` *(Ruta directa backup: `http://localhost:8080`)*
   * **Health & Routing JSON:** `http://localhost/api/health`
   * **Tablero en Vivo HAProxy DB & Redis (`database-lb`):** `http://localhost:8404/stats`
   * **Nagios Core (19 Hosts / 19 Services, Hard State <= 1 min):** `http://localhost:8088/nagios` *(usuario: `nagiosadmin` / pass en `.env`)*

---

## 🛠️ Stack Tecnológico
* **Balanceo de Carga y Alta Disponibilidad:** HAProxy 3.2 + Keepalived (VRRP Unicast VIPs `172.30.0.250` y `172.31.0.250`) + `database-lb` Cluster-Aware Proxy
* **Capa de Presentación y Aplicación:** 3 Nodos Web (Nginx Alpine) + 3 Nodos API (Node.js 22 con `readPool` `:3307` y `writePool` `:3306` acotados)
* **Capa de Datos sin SPOF:** MariaDB Galera Cluster 11.4 (3 nodos), MongoDB 8 Replica Set `rs0` (3 nodos), Redis 7 Master-Replica + Sentinel HA
* **Observabilidad y Pruebas:** Nagios Core 4.5, HAProxy Stats UI, ApacheBench (`ab`), Siege, Apache JMeter y Chaos Monkey
