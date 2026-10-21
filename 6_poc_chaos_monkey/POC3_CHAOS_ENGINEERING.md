# PoC 3: Chaos Engineering con Chaos Monkey (1 Solo Nodo Vivo por Capa)

## Objetivo
Llevar la infraestructura al límite extremo de **Chaos Engineering**: destruir simultáneamente dos tercios (66%) de la capa Web, dos tercios (66%) de la capa API, el 50% de los balanceadores HAProxy/Keepalived y dos tercios (66%) del clúster de base de datos MariaDB Galera, demostrando que el sistema sobrevive con **1 único nodo vivo por capa** con **0 segundos de caída total**.

---

## 1. Script Automatizado Estilo Netflix (`chaos-monkey-aleatorio.ps1`)
En esta carpeta se incluye el script `chaos-monkey-aleatorio.ps1`, el cual:
1. Asegura el quórum en `galera1` (`wsrep_provider_pc_ignore_quorum=ON`).
2. **Selecciona al azar (Random)** 2 de los 3 nodos Web (`web1`, `web2`, `web3`) y los apaga.
3. **Selecciona al azar (Random)** 2 de los 3 nodos App (`app1`, `app2`, `app3`) y los apaga.
4. **Selecciona al azar (Random)** 1 balanceador de Presentación y 1 de Aplicación para apagarlos.
5. Apaga `galera2` y `galera3`.
6. Limpia el caché de Redis (`POST /api/cache/clear`) y consulta la API en vivo para demostrar que el único sobreviviente de cada capa responde correctamente.

Para ejecutarlo en vivo frente al profesor:
```powershell
powershell -ExecutionPolicy Bypass -File .\entregables\6_poc_chaos_monkey\chaos-monkey-aleatorio.ps1
```

---

## 2. Dos Pruebas Deterministas Cruzadas (Mínimo Necesario con Nodos Diferentes)

### Prueba Caos 1 (`chaos-prueba-1.ps1`)
* **Se apagan:** `web1`, `web2`, `app2`, `app3`, `application-lb-master` (+ `keepalived`), `galera2`, `galera3`.
* **Sobreviven:** `presentation-lb-master` $\rightarrow$ **`webnode3`** $\rightarrow$ **`application-lb-backup`** $\rightarrow$ **`app1`** $\rightarrow$ **`galera1`**.
* **Comando directo:**
  ```powershell
  docker exec -it distributed-three-tier-galera1-1 mariadb -u root -pchange-this-root-password -e "SET GLOBAL wsrep_provider_pc_bootstrap=ON; SET GLOBAL wsrep_provider_pc_ignore_quorum=ON; SET GLOBAL wsrep_provider_pc_ignore_sb=ON;"
  docker stop distributed-three-tier-web1-1 distributed-three-tier-web2-1 distributed-three-tier-app2-1 distributed-three-tier-app3-1 distributed-three-tier-application-lb-master-1 distributed-three-tier-application-keepalived-master-1 distributed-three-tier-galera2-1 distributed-three-tier-galera3-1
  ```

### Prueba Caos 2 (`chaos-prueba-2.ps1` — Nodos sobrevivientes totalmente distintos)
* **Primero restaurar todo:** `docker compose start`
* **Se apagan:** `web3`, `web1`, `app3`, `app1`, `presentation-lb-master` (+ `keepalived`), `galera2`, `galera3`.
* **Sobreviven:** **`presentation-lb-backup`** $\rightarrow$ **`webnode2`** $\rightarrow$ `application-lb-master` $\rightarrow$ **`app2`** $\rightarrow$ **`galera1`**.
* **Comando directo:**
  ```powershell
  docker stop distributed-three-tier-web3-1 distributed-three-tier-web1-1 distributed-three-tier-app3-1 distributed-three-tier-app1-1 distributed-three-tier-presentation-lb-master-1 distributed-three-tier-presentation-keepalived-master-1 distributed-three-tier-galera2-1 distributed-three-tier-galera3-1
  ```

