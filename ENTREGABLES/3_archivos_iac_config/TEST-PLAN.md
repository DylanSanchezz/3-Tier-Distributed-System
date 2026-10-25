# Resilience, HA, Failover and Performance Test Plan

Complete test set for the `distributed-three-tier` project, plus commonly used tools.
The lab in this folder already covers ab, Siege, JMeter and container-level Chaos Monkey faults.

## 1. Baseline and functional checks (before any fault)

- Every layer is healthy: HAProxy backends all UP, `/api/health` returns OK, Galera `wsrep_cluster_size=3`, MongoDB Replica Set `rs0` has 3 members (`1 PRIMARY + 2 SECONDARY`), Redis Master + Replica + Sentinel online, VIPs held by their masters.
- Round-robin: the `X-Web-Node`, `X-Presentation-LB`, `X-Application-LB`, `app1-3`, and `database-lb:read (galera1-3)` headers rotate across requests.
- Data consistency: a write on one Galera node is readable on the others; MongoDB reviews replicate across `mongo1-3`; cache hits and misses behave correctly.

## 2. Performance tests

| Test | Goal | Lab tool |
|---|---|---|
| Smoke | Confirm the path works with 1-5 users | ab, JMeter |
| Load | Expected traffic held for sustained window | JMeter, Siege, ab |
| Stress | Ramp up until errors or latency climb; find the first bottleneck | ab, JMeter |
| Spike | Jump from 5 to 300 users within seconds, then recover | ab, JMeter |
| Soak | Moderate load over extended window to check connection stability | ab, Siege, JMeter |
| Cache effect | Compare latency with and without Redis (`/cache/clear`) | ab, JMeter |
| Capacity per layer | Test web, app and DB directly, bypassing upper layers, to locate the bottleneck | ab |

Track p50/p95/p99 latency, throughput, error rate and CPU/memory per container (`docker stats` or cAdvisor).
Use SLO-style targets, e.g. p95 < 200 ms and availability >= 99.9%.

## 3. HA and failover tests

Run each under constant load; record outage time and failed requests.

| Component | Fault | Expected result (After Architecture Improvements) |
|---|---|---|
| Presentation LB master | stop, kill, pause | VIP moves to the backup within about 3-4 s |
| Presentation LB master | HAProxy hangs but container stays up | Keepalived check script fails, priority drops by 20, backup takes over |
| Presentation LB master | recovery | Failback without flapping |
| Application LB master | same three faults | Same, on `172.31.0.250` |
| Both LBs of one tier | stop both | Total outage, recovery on restart (negative test) |
| 1 of 3 web/app nodes | stop | HAProxy health check drops it; zero or near-zero errors |
| 2 of 3 web/app nodes | stop | Reduced capacity but still serving |
| Galera node | stop galera2 or galera3 | Cluster keeps quorum |
| Galera node | stop galera1 | **NOW SUCCEEDS**: `database-lb` fails over writes (`:3306`) & reads (`:3307`) to `galera2`/`galera3` |
| Redis | stop redis-master / stop all Redis | Master->Replica HA failover (`:6379`); if both stopped, graceful DB-only reads, no 500s |
| MongoDB | stop mongo1 / stop all Mongo | `rs0` elects `mongo2`/`mongo3` seamlessly; if all 3 stopped, catalog works & reviews degrade cleanly |
| Entry proxy | stop | Escape route available on `http://localhost:8080` (`presentation-lb-backup`) |

## 4. Chaos engineering tests

Each experiment: state a steady-state hypothesis (e.g. availability >= 99% and p95 < 500 ms), inject the fault,
compare against the hypothesis, recover, record findings.

- **Container faults:** random stop/kill/pause, several victims at once.
- **Compound faults:** load test plus node failure plus cache flush at the same time.
- **Recovery faults:** restart the whole stack; check startup order, cold cache and Galera re-bootstrap after losing all nodes.

## 5. Observability and alerting checks

- Nagios (`http://localhost:8088/nagios`) alerts on each fault within its check interval ($\le 1\text{ min}$); count missed and false alerts.
- HAProxy Database & Redis Stats (`http://localhost:8404/stats`) reflects active/backup/down backend states in real time.
- Logs and `X-Request-Trace` headers are sufficient to reconstruct the timeline, MTTD, MTTR, and error budget.
