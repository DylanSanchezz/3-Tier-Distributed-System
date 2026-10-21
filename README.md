# 3-Tier Distributed System (High Availability & Resilience)

Sistema distribuido de 3 capas con alta disponibilidad (HA) y resiliencia. Implementa una arquitectura multinodo utilizando **HAProxy**, **Keepalived**, **Galera Cluster (MariaDB)**, **MongoDB**, **Redis** y monitoreo con **Nagios**, validada mediante pruebas de carga (Load Testing) e Ingeniería del Caos (Chaos Engineering).

---

## 📂 Índice de Entregables

1. **[Diagrama de Arquitectura](./1_diagrama_arquitectura/)**: Diseño visual de la topología de red, balanceadores de carga, capa de aplicación y clústeres de bases de datos.
2. **[Documentación del Proyecto](./2_documentacion_markdown/)**: Documentación técnica detallada de la arquitectura y justificación de componentes (`README_TAREA_995.md` y explicación IaC).
3. **[Archivos IaC y Configuración](./3_archivos_iac_config/)**: `Dockerfiles`, manifiestos `docker-compose`, scripts de aprovisionamiento y configuraciones de HAProxy/Keepalived.
4. **[PoC 1: Load Testing](./4_poc_load_testing/)**: Evidencias y scripts de pruebas de estrés y balanceo de tráfico entre nodos.
5. **[PoC 2: Simple Failover](./5_poc_simple_failover/)**: Pruebas de conmutación por error ante la caída individual de nodos web/API o balanceadores.
6. **[PoC 3: Chaos Monkey](./6_poc_chaos_monkey/)**: Ejecución de pruebas de resiliencia automatizadas matando contenedores de forma aleatoria y verificación de auto-recuperación.

---

## 🏗️ Vista Rápida de la Arquitectura

*(Opcional: Si subiste una imagen `.png` o `.jpg` dentro de `1_diagrama_arquitectura`, puedes incrustarla aquí mismo usando:)*
`![Diagrama de Arquitectura](./1_diagrama_arquitectura/NOMBRE_DE_TU_IMAGEN.png)`

---

## 🛠️ Stack Tecnológico
* **Balanceo y VIP:** HAProxy + Keepalived
* **Capa Web / API:** 3 Nodos Web + 3 Nodos API
* **Persistencia y Caché:** MariaDB Galera Cluster (3 nodos), MongoDB, Redis
* **Automatización y Contenedores:** Docker, PowerShell, Bash
