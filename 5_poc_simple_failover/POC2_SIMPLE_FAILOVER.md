# PoC 2: Simple Failover Test

## Objetivo
Demostrar cómo la arquitectura tolera la caída puntual de un balanceador `MASTER` (conmutación de VIP flotante vía Keepalived VRRP) o de un nodo individual de servidor (`web` o `app`) sin afectar la disponibilidad de la tienda.

---

## Prueba 2A: Failover de VIP Interna (Capa de Aplicación)

1. **Estado Inicial:** En `http://localhost`, las trazas muestran `application-lb-master` (`172.31.0.11`, dueño inicial de la VIP `172.31.0.250`).
2. **Inyección de Fallo Simple:** Apagar únicamente el balanceador maestro de aplicación y su Keepalived:
   ```powershell
   docker stop distributed-three-tier-application-lb-master-1 distributed-three-tier-application-keepalived-master-1
   ```
3. **Verificación en Vivo:**
   * En menos de 3 segundos, `application-keepalived-backup` toma la VIP `172.31.0.250`.
   * Al recargar `http://localhost` con `F5`, la tienda sigue funcionando al 100% y la traza ahora muestra **`application-lb-backup`** mientras sigue rotando entre `app1`, `app2` y `app3`.
4. **Restauración (Failback automático a Master):**
   ```powershell
   docker compose start
   ```

---

## Prueba 2B: Failover de VIP Externa (Capa de Presentación) + Caída de `web1`

1. **Inyección de Fallo Simple:** Apagar el balanceador maestro de presentación, su Keepalived y el nodo `web1`:
   ```powershell
   docker stop distributed-three-tier-presentation-lb-master-1 distributed-three-tier-presentation-keepalived-master-1 distributed-three-tier-web1-1
   ```
2. **Verificación en Vivo:**
   * `presentation-keepalived-backup` toma la VIP `172.30.0.250` (y además expone directamente el puerto `8080` en `http://localhost:8080`).
   * Al recargar con `F5`, la traza cambia a **`presentation-lb-backup`** y el tráfico web rota exclusivamente entre los sobrevivientes **`webnode2`** y **`webnode3`**.
3. **Restauración:**
   ```powershell
   docker compose start
   ```

