# Diagrama de Arquitectura V2 (ToDo 2 & 3 Completos) — Tarea #995

En esta misma carpeta se encuentra el archivo de imagen listo para entregar:
- **`diagrama_arquitectura_3_capas.jpg`** (Resolución `2100x1420`, formato `.jpg`).

## Código Mermaid Actualizado (Importable en Lucidchart: *Insert -> Advanced -> Mermaid*)

```mermaid
flowchart TB
    Browser["Cliente / Navegador / ab / Siege / JMeter<br/>http://localhost:80 | http://localhost:8080"]

    subgraph Edge["Capa 1: Presentación · Red edge (172.30.0.0/24)"]
        PE["presentation-entry<br/>HAProxy TCP :80 -> VIP"]
        PLBM["presentation-lb-master<br/>HAProxy 3.2 · 172.30.0.11<br/>Keepalived MASTER (Prio 110)"]
        PVIP(("VIP Presentación<br/>172.30.0.250:80<br/>VRRP ID 51"))
        PLBB["presentation-lb-backup<br/>HAProxy 3.2 · 172.30.0.12 (:8080->:80)<br/>Keepalived BACKUP (Prio 100)"]
        W1["web1 (Nginx)<br/>hostname: webnode1"]
        W2["web2 (Nginx)<br/>hostname: webnode2"]
        W3["web3 (Nginx)<br/>hostname: webnode3"]

        PE --> PVIP
        PLBM --- PVIP
        PLBB -. failover .-> PVIP
        PVIP --> W1 & W2 & W3
    end

    subgraph App["Capa 2: Aplicación · Red interna application (172.31.0.0/24)"]
        ALBM["application-lb-master<br/>HAProxy 3.2 · 172.31.0.11:8080<br/>Keepalived MASTER (Prio 110)"]
        AVIP(("VIP Aplicación<br/>172.31.0.250:8080<br/>VRRP ID 52"))
        ALBB["application-lb-backup<br/>HAProxy 3.2 · 172.31.0.12:8080<br/>Keepalived BACKUP (Prio 100)"]
        A1["app1 (Node.js API :8080)<br/>ReadPool=5 | WritePool=2"]
        A2["app2 (Node.js API :8080)<br/>ReadPool=5 | WritePool=2"]
        A3["app3 (Node.js API :8080)<br/>ReadPool=5 | WritePool=2"]

        ALBM --- AVIP
        ALBB -. failover .-> AVIP
        AVIP --> A1 & A2 & A3
    end

    subgraph Data["Capa 3: Datos sin SPOF · Red interna database (Aislada)"]
        DBLB["database-lb (HAProxy Cluster-Aware Proxy)<br/>:3306 Write Primary+Failover | :3307 Read Round-Robin<br/>:6379 Redis HA | :8404/stats Live UI"]

        subgraph RedisHA["Redis 7 High Availability (ToDo 2.2 & 2.3)"]
            RM[("redis-master :6379<br/>Disposable Cache-Aside (TTL 60s + AOF)")]
            RR[("redis-replica :6379<br/>Hot Failover Replica + AOF")]
            RS["redis-sentinel :26379<br/>Quorum & Failover Monitor"]
            RM -->|"Replication"| RR
            RS -.->|"Monitors mymaster"| RM & RR
        end

        subgraph Galera["MariaDB Galera 11.4 Cluster (ToDo 3.1-3.4)"]
            G1[("galera1 :3306<br/>Writer Primary + Reader (max_conn=300)")]
            G2[("galera2 :3306<br/>Writer Backup + Reader (max_conn=300)")]
            G3[("galera3 :3306<br/>Writer Backup + Reader (max_conn=300)")]
            G1 <-->|"WSREP Sync"| G2
            G2 <-->|"WSREP Sync"| G3
            G3 <-->|"WSREP Sync"| G1
        end

        subgraph MongoRS["MongoDB 8 Replica Set rs0 (ToDo 2.1)"]
            M1[("mongo1 :27017<br/>rs0 PRIMARY (Prio 2)")]
            M2[("mongo2 :27017<br/>rs0 SECONDARY (Prio 1)")]
            M3[("mongo3 :27017<br/>rs0 SECONDARY (Prio 1)")]
            M1 <-->|"rs0 Oplog Sync"| M2 & M3
        end
    end

    subgraph Mon["Observabilidad y Alertas"]
        N["Nagios Core 4.5<br/>http://localhost:8088/nagios<br/>19 Hosts + 19 Services (Hard State <= 1 min)"]
    end

    Browser -->|"HTTP :80"| PE
    Browser -.->|"Escape HTTP :8080"| PLBB
    W1 & W2 & W3 -->|"Proxy /api -> VIP"| AVIP
    A1 & A2 & A3 -->|"SQL Read :3307 / Write :3306 / Redis :6379"| DBLB
    DBLB -->|"PING/+PONG Failover"| RM
    DBLB -.->|"Backup Failover"| RR
    DBLB -->|"Write Primary :3306"| G1
    DBLB -.->|"Write Backup :3306"| G2 & G3
    DBLB -->|"Read Round-Robin :3307"| G1 & G2 & G3
    A1 & A2 & A3 -->|"replicaSet=rs0 & secondaryPreferred"| M1 & M2 & M3
    N -.->|"TCP & HTTP Checks"| Edge & App & Data
```
