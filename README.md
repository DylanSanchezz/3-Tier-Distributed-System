# 3-Tier Distributed System (High Availability & Resilience)

Sistema distribuido de 3 capas con alta disponibilidad (HA) y resiliencia. Implementa una arquitectura multinodo utilizando **HAProxy**, **Keepalived**, **Galera Cluster (MariaDB)**, **MongoDB**, **Redis** y monitoreo con **Nagios**, validada mediante pruebas de carga (Load Testing) e Ingeniería del Caos (Chaos Engineering).

---

## 📄 Documentación Principal (Acceso Rápido)

* 📘 **[README_TAREA_995.md](./README_TAREA_995.md)**: Documentación general del entregable, desglose de la arquitectura, topología y cumplimiento de requerimientos.
* ⚙️ **[EXPLICACION_IAC.md](./EXPLICACION_IAC.md)**: Detalle técnico de la Infraestructura como Código (IaC), aprovisionamiento de contenedores, redes y orquestación.

---

## 📂 Estructura de Entregables por Carpeta

1. 📁 **[1_diagrama_arquitectura](./1_diagrama_arquitectura/)**: Archivos fuente y diseño de la topología del sistema distribuido de 3 capas.
2. 📁 **[2_documentacion_markdown](./2_documentacion_markdown/)**: Respaldo de la documentación técnica en formato Markdown (`README_TAREA_995.md`)[cite: 1].
3. 📁 **[3_archivos_iac_config](./3_archivos_iac_config/)**: Manifiestos, `Dockerfiles`, scripts de automatización y archivos de configuración de los nodos y balanceadores.
4. 📁 **[4_poc_load_testing](./4_poc_load_testing/)**: Scripts y evidencias de las pruebas de carga y distribución de tráfico.
5. 📁 **[5_poc_simple_failover](./5_poc_simple_failover/)**: Pruebas de caída controlada y validación de conmutación por error (Failover).
6. 📁 **[6_poc_chaos_monkey](./6_poc_chaos_monkey/)**: Scripts y resultados de pruebas de Ingeniería del Caos y auto-recuperación de servicios.

---

## 🛠️ Stack Tecnológico
* **Balanceo de Carga y Alta Disponibilidad:** HAProxy + Keepalived[cite: 1]
* **Capa de Aplicación:** 3 Nodos Web + 3 Nodos API
* **Capa de Datos y Caché:** MariaDB Galera Cluster (3 nodos), MongoDB, Redis[cite: 1]
* **Monitoreo:** Nagios
* **Automatización e IaC:** Docker, PowerShell (85.6%), Dockerfile (13.4%), Shell (1%)[cite: 1]
