# PoC 1: Pruebas de Rendimiento y Escalabilidad (`TEST-PLAN.md` Punto 2)

## Objetivo
Evaluar la capacidad de respuesta, el cumplimiento de SLOs (`p95 < 200 ms`, disponibilidad `>= 99.9%`), el impacto real del caché Redis HA y la capacidad por capa usando **ApacheBench (`ab`)**, **Siege** y **Apache JMeter**.

---

## 1. Comandos para Ejecutar en Vivo (Sin Instalar Nada en Windows)

* **Smoke Test (`ab` — 20 peticiones, 2 usuarios):**
  ```powershell
  docker run --rm --network distributed-three-tier_edge httpd:2.4-alpine ab -n 20 -c 2 http://172.30.0.250/api/products/cheapest
  ```
* **Load Test Estándar (`ab` — 2,000 peticiones, 50 usuarios concurrentes):**
  ```powershell
  docker run --rm --network distributed-three-tier_edge httpd:2.4-alpine ab -n 2000 -c 50 http://172.30.0.250/api/products/cheapest
  ```
* **Stress & Spike Test (`ab` — 150 y 250 usuarios concurrentes):**
  ```powershell
  docker run --rm --network distributed-three-tier_edge httpd:2.4-alpine ab -n 3000 -c 150 http://172.30.0.250/api/products/cheapest
  docker run --rm --network distributed-three-tier_edge httpd:2.4-alpine ab -n 2000 -c 250 http://172.30.0.250/api/products/cheapest
  ```
* **Load Test Alternativo con Siege (Contenedor Efímero):**
  ```powershell
  docker run --rm -t --network distributed-three-tier_edge yokogawa/siege -c 25 -r 20 http://172.30.0.250/api/products/cheapest
  ```
* **Plan Completo en Apache JMeter:**
  Abrir el archivo `../7_test_plan_completo/test-plan-tarea995.jmx` en Apache JMeter GUI (incluye los Thread Groups de *Smoke, Load, Spike* y *Cache Effect*).

---

## 2. Resultados Reales Obtenidos (Arquitectura V2)

| Tipo de Prueba | Parámetros | Peticiones Completadas | Errores (`Failed`) | Throughput (`req/seg`) | Latencia `p50` | Latencia `p95` | Latencia `p99` | Estado SLO |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Smoke Test** | `-n 20 -c 2` | `20` | **`0` (0%)** | `191.59 req/s` | `6 ms` | **`37 ms`** | `37 ms` | Cumple (`< 200 ms`) |
| **Load Test (Previo V1)** | `-n 1000 -c 50` | `1000` | **`0` (0%)** | `730.59 req/s` | `59 ms` | **`145 ms`** | `165 ms` | Cumple (`< 200 ms`) |
| **Load Test (V2 Cluster)** | `-n 2000 -c 50` | `2000` | **`0` (0%)** | `553.20 req/s` | `79 ms` | **`174 ms`** | `244 ms` | Cumple (`< 200 ms`) |
| **Stress Test** | `-n 3000 -c 150` | `3000` | **`0` (0%)** | **`727.64 req/s`** | `190 ms` | `328 ms` | `401 ms` | 100% Disponibilidad |
| **Spike Test** | `-n 2000 -c 250` | `2000` | **`0` (0%)** | `620.45 req/s` | `324 ms` | `658 ms` | `702 ms` | 0% Errores bajo pico |

---

## 3. Comparativa del Efecto Caché (Con Redis HA vs. Sin Redis — Fallback Directo a Galera)

Prueba con `-n 500 -c 20` comparando respuestas servidas desde Redis HA frente a respuestas con ambos nodos Redis detenidos (lectura directa Round-Robin en Galera vía `database-lb:3307`):

| Escenario | Errores | Throughput (`req/seg`) | Latencia Media | `p50` | `p95` | `p99` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Con Redis HA Activo (`Cache Hit`)** | `0` | **`713.92 req/s`** | `28.01 ms` | `25 ms` | **`44 ms`** | `55 ms` |
| **Sin Redis (`Disposable Fallback` $\rightarrow$ Galera `:3307`)** | `0` | **`450.23 req/s`** | `44.42 ms` | `41 ms` | **`75 ms`** | `109 ms` |

* **Conclusión:** Redis incrementa el rendimiento en **+58.5%** y reduce la latencia `p95` en **41.3%**, mientras que la política de *caché desechable* (`ToDo 2.3`) garantiza **cero errores `500`** si Redis desaparece por completo.

---

## 4. Capacidad Aislada por Capa (`-n 1000 -c 50`)

| Capa Evaluada Directamente | Endpoint Interno | Errores | Throughput (`req/seg`) | `p50` | `p95` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Capa 1 (Web Estático Nginx directo)** | `http://web1/` | `0` | **`688.91 req/s`** | `68 ms` | `110 ms` |
| **Capa 2 (Node.js API directo)** | `http://app1:8080/products/cheapest` | `0` | **`598.16 req/s`** | `78 ms` | `127 ms` |
| **Stack Completo (Entry $\rightarrow$ VIP $\rightarrow$ Web $\rightarrow$ VIP $\rightarrow$ App $\rightarrow$ Proxy)** | `http://172.30.0.250/api/products/cheapest` | `0` | **`553.20 req/s`** | `79 ms` | `174 ms` |
