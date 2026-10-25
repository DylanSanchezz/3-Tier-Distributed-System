# Distributed System Improvement To-do

The current stack is a useful single-host demonstration, but several parts
are not yet highly available or horizontally scalable. Work through these
improvements in order.

## 1. Move beyond single-host Compose

- [ ] Deploy across multiple nodes using Kubernetes or a managed container
  platform.
- [ ] Route external traffic through a managed load balancer or ingress.
- [ ] Use platform service discovery, health-based routing, automatic restarts,
  and replica scaling.
- [ ] Keep Docker Compose as the local development environment.
- [ ] Revisit the Keepalived VIPs and published presentation port; they do not
  provide host-level high availability in a single-host Compose deployment.

## 2. Remove single-instance data dependencies

- [x] Move MongoDB to a managed service or configure a properly operated
  replica set.
  *(Implemented: 3-node MongoDB 8 Replica Set `rs0` across `mongo1`, `mongo2`, `mongo3` with keyfile internal auth, automatic primary election, and `secondaryPreferred` read routing).*
- [x] Move Redis to a managed service or configure an appropriate
  high-availability mode.
  *(Implemented: Master-Replica HA (`redis-master` + `redis-replica`) monitored by `redis-sentinel` and routed via `database-lb:6379` with Layer-7 `PING/+PONG` health checks).*
- [x] Decide whether Redis is a disposable cache or whether its data must
  survive failures.
  *(Decision: Redis is treated as a disposable Cache-Aside layer (`store:products:cheapest`, `TTL=60s`) with AOF persistence for warm restarts; if all Redis nodes go down, the API degrades gracefully by querying MariaDB Galera directly with zero `500` errors).*
- [ ] Add monitoring and backup/restore plans for MariaDB.
- [ ] Test database restore procedures regularly.

## 3. Make database routing cluster-aware

- [x] Stop connecting application nodes directly to `galera1`.
  *(Implemented: `app1`, `app2`, `app3` and `catalog-init` connect exclusively to `DB_HOST=database-lb`; stopping `galera1` causes zero downtime).*
- [x] Add a database-aware proxy or managed endpoint for failover and
  connection routing.
  *(Implemented: `database-lb` HAProxy proxy with dedicated Write (`:3306`) and Read (`:3307`) endpoints, health checks every 2s, `option redispatch`, `maxconn` guards, and live dashboard at `http://localhost:8404/stats`).*
- [x] Define read/write routing behavior for the Galera cluster.
  *(Implemented: Read/Write Splitting — `writePool` routes DDL/DML & write-path checks to `:3306` Single-Writer Primary `galera1` with automatic failover `galera2 -> galera3` to avoid WSREP certification deadlocks; `readPool` routes `SELECT` queries to `:3307` Round-Robin across `galera1`, `galera2`, `galera3`).*
- [x] Review database connection-pool limits as application replicas scale.
  *(Implemented: Configurable bounded pools per replica: `DB_READ_POOL_LIMIT=5`, `DB_WRITE_POOL_LIMIT=2`, `DB_POOL_QUEUE_LIMIT=50`, `maxIdle=2`, `idleTimeout=30s`, paired with MariaDB `--max-connections=300` and HAProxy `maxconn 90` per node — 3 replicas consume at most 21 connections, scaling safely up to ~40 API replicas).*

## 4. Improve cache behavior

- [ ] Define cache keys and TTLs for each cached query.
- [ ] Invalidate affected cache entries when catalog data changes.
- [ ] Add cache-stampede protection so concurrent cache misses do not all query
  MariaDB.
- [ ] Keep the cache-clear API scoped to the intended application cache keys.

## 5. Add production observability

- [ ] Instrument the presentation, API, and database calls with OpenTelemetry.
- [ ] Collect logs, metrics, and traces centrally.
- [ ] Add dashboards and alerts for latency, error rates, resource saturation,
  database health, and cache hit rate.
- [ ] Replace the custom trace headers and UI with distributed traces that
  include timings and cross-service spans.
- [ ] Review the current trace UI and service wiring in
  [catalog.js](./web/catalog.js), [index.js](./application/index.js), and
  [docker-compose.yml](./docker-compose.yml).

## 6. Tighten security and operations

- [ ] Create a least-privilege MongoDB application user instead of using the
  MongoDB root account.
- [ ] Protect Redis if it is reachable beyond a trusted private network.
- [ ] Manage secrets outside checked-in environment files.
- [ ] Add TLS at the public ingress.
- [ ] Add API authentication and rate limiting where appropriate.
- [ ] Adopt database migrations.
- [ ] Document operational and recovery procedures.

## Suggested implementation order

1. Replace the single MongoDB and Redis instances with managed or replicated
   equivalents.
2. Add a database-aware MariaDB endpoint.
3. Move stateless web and API replicas to a multi-node scheduler.
4. Replace custom traces with distributed tracing.
