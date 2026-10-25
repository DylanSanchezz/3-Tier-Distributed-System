import { createServer } from "node:http";
import { MongoClient } from "mongodb";
import mysql from "mysql2/promise";
import { createClient } from "redis";

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

// ToDo 3.3 & 3.4: Cluster-aware Read/Write routing pools with bounded connection limits
// Formula: Replicas * (READ_LIMIT + WRITE_LIMIT) << MariaDB max_connections (300)
// Default: 3 replicas * (5 read + 2 write) = 21 max connections (scales safely to ~40 replicas).
const readPoolLimit = Number(process.env.DB_READ_POOL_LIMIT || 5);
const writePoolLimit = Number(process.env.DB_WRITE_POOL_LIMIT || 2);
const poolQueueLimit = Number(process.env.DB_POOL_QUEUE_LIMIT || 50);

const sharedDbConfig = {
  host: required("DB_HOST"),
  database: required("DB_NAME"),
  user: required("DB_USER"),
  password: required("DB_PASSWORD"),
  waitForConnections: true,
  queueLimit: poolQueueLimit,
  connectTimeout: 5000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
};

// Read pool -> database-lb:3307 (Round-Robin across all Synced Galera nodes)
const readPool = mysql.createPool({
  ...sharedDbConfig,
  port: Number(process.env.DB_READ_PORT || 3307),
  connectionLimit: readPoolLimit,
  maxIdle: Math.min(2, readPoolLimit),
  idleTimeout: 30000,
});

// Write pool -> database-lb:3306 (Single-Primary Writer with automatic failover)
const writePool = mysql.createPool({
  ...sharedDbConfig,
  port: Number(process.env.DB_WRITE_PORT || process.env.DB_PORT || 3306),
  connectionLimit: writePoolLimit,
  maxIdle: Math.min(1, writePoolLimit),
  idleTimeout: 30000,
});

// ToDo 2.1: MongoDB 3-node Replica Set (rs0) with secondaryPreferred read routing
const defaultMongoPort = Number(process.env.MONGO_PORT || 27017);
const mongoHosts = required("MONGO_HOST")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean)
  .map((host) => (host.includes(":") ? host : `${host}:${defaultMongoPort}`))
  .join(",");

const mongo = new MongoClient(
  `mongodb://${mongoHosts}/${encodeURIComponent(required("MONGO_DB"))}?replicaSet=rs0&readPreference=secondaryPreferred`,
  {
    auth: {
      username: required("MONGO_USER"),
      password: required("MONGO_PASSWORD"),
    },
    authSource: "admin",
    serverSelectionTimeoutMS: 3000,
    maxPoolSize: 10,
  },
);

// ToDo 2.2 & 2.3: Redis HA endpoint treated as a disposable Cache-Aside layer (graceful DB fallback)
const redis = createClient({
  disableOfflineQueue: true,
  socket: {
    host: required("REDIS_HOST"),
    port: Number(process.env.REDIS_PORT || 6379),
    connectTimeout: 1500,
    reconnectStrategy: (retries) => Math.min(retries * 200, 1500),
  },
});
redis.on("error", (error) => console.error("Redis client error:", error.message));

const withCacheTimeout = (promise, ms = 400) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Redis disposable cache timeout")), ms)),
  ]);

class HttpError extends Error {
  constructor(statusCode, message, trace) {
    super(message);
    this.statusCode = statusCode;
    this.trace = trace;
  }
}

const readJsonBody = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) {
      throw new HttpError(413, "Request body is too large");
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
};

const sendJson = (response, statusCode, payload, trace = []) => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "x-request-trace": trace.join(" -> "),
  });
  response.end(JSON.stringify(payload));
};

const start = async () => {
  try {
    await mongo.connect();
  } catch (err) {
    console.warn("Initial MongoDB Replica Set connection warning:", err.message);
  }
  try {
    await redis.connect();
  } catch (err) {
    console.warn("Initial Redis connection failed, continuing in disposable-cache mode:", err.message);
  }

  const reviews = mongo.db(required("MONGO_DB")).collection("product_reviews");
  const productsCacheKey = "store:products:cheapest";

  const server = createServer((request, response) => {
    const trace = [
      request.headers["x-presentation-lb"] || "presentation-lb-unknown",
      request.headers["x-web-node"] || "web-node-unknown",
      request.headers["x-application-lb"] || "application-lb-unknown",
      process.env.APPLICATION_NODE || "app-node-unknown",
    ];
    void (async () => {
      const pathname = new URL(request.url, "http://localhost").pathname;

      if (request.method === "GET" && pathname === "/health") {
        const [[[readRow]], [[writeRow]]] = await Promise.all([
          readPool.query("SELECT @@hostname AS dbNode"),
          writePool.query("SELECT @@hostname AS dbNode"),
        ]);
        let mongoStatus = "mongodb-rs0";
        try {
          await mongo.db().command({ ping: 1 }, { readPreference: "secondaryPreferred" });
        } catch {
          mongoStatus = "mongodb-rs0 (degraded)";
        }
        let redisStatus = "redis-ha";
        try {
          if (redis.isReady) await withCacheTimeout(redis.ping(), 400);
          else redisStatus = "redis (disposable bypass)";
        } catch {
          redisStatus = "redis (disposable bypass)";
        }
        sendJson(
          response,
          200,
          {
            status: "ok",
            routing: {
              readNode: readRow?.dbNode,
              writePrimary: writeRow?.dbNode,
              pools: { readPoolLimit, writePoolLimit, poolQueueLimit },
            },
          },
          [
            ...trace,
            `database-lb:read(${readRow?.dbNode || "galera"})`,
            `database-lb:write(${writeRow?.dbNode || "galera"})`,
            mongoStatus,
            redisStatus,
          ],
        );
        return;
      }

      if (request.method === "GET" && pathname === "/") {
        sendJson(response, 200, {
          service: "store-catalog-api",
          products: "/products/cheapest",
          reviews: "/products/{sku}/reviews",
        }, trace);
        return;
      }

      if (request.method === "GET" && pathname === "/products/cheapest") {
        trace.push("redis-ha");
        let cached = null;
        let redisAvailable = false;
        try {
          if (redis.isReady) {
            cached = await withCacheTimeout(redis.get(productsCacheKey), 400);
            redisAvailable = true;
          }
        } catch (err) {
          console.warn("Disposable Redis cache read bypass:", err.message);
        }
        if (cached) {
          trace.push("cache hit");
          sendJson(response, 200, JSON.parse(cached), trace);
          return;
        }
        trace[trace.length - 1] = redisAvailable ? "redis-ha (cache miss)" : "redis-ha (disposable fallback)";
        const [products] = await readPool.execute(
          "SELECT id, sku, name, description, price, @@hostname AS dbNode FROM products ORDER BY price ASC, id ASC LIMIT 10",
        );
        const dbNode = products[0]?.dbNode || "galera";
        const cleanProducts = products.map(({ dbNode: _ignore, ...rest }) => rest);
        trace.push(`database-lb:read (${dbNode})`);
        if (redisAvailable && redis.isReady) {
          try {
            await withCacheTimeout(redis.set(productsCacheKey, JSON.stringify(cleanProducts), { EX: 60 }), 400);
            trace.push("redis-ha (cache write)");
          } catch {
            trace.push("redis-ha (write skipped)");
          }
        }
        sendJson(response, 200, cleanProducts, trace);
        return;
      }

      if (request.method === "POST" && pathname === "/cache/clear") {
        let removed = 0;
        let clearedStatus = "redis-ha (delete catalog cache)";
        try {
          if (redis.isReady) {
            removed = await withCacheTimeout(redis.del(productsCacheKey), 400);
          } else {
            clearedStatus = "redis-ha (disposable offline)";
          }
        } catch {
          clearedStatus = "redis-ha (disposable offline)";
        }
        sendJson(
          response,
          200,
          { cacheKey: productsCacheKey, cacheEntryRemoved: removed === 1 },
          [...trace, clearedStatus],
        );
        return;
      }

      const reviewMatch = pathname.match(/^\/products\/([A-Za-z0-9-]+)\/reviews$/);
      if (reviewMatch && request.method === "GET") {
        const productSku = reviewMatch[1];
        const [helloInfo, productReviews] = await Promise.all([
          mongo
            .db()
            .command({ hello: 1 }, { readPreference: "secondaryPreferred" })
            .catch(() => ({ me: "rs0" })),
          reviews
            .find({ sku: productSku })
            .sort({ createdAt: -1 })
            .limit(50)
            .project({ _id: 0, reviewer: 1, rating: 1, comment: 1, createdAt: 1 })
            .toArray(),
        ]);
        const mongoMember = (helloInfo?.me || "rs0").split(":")[0];
        sendJson(
          response,
          200,
          { sku: productSku, reviews: productReviews },
          [...trace, `mongodb-rs0 (${mongoMember})`],
        );
        return;
      }

      if (reviewMatch && request.method === "POST") {
        if (!request.headers["content-type"]?.includes("application/json")) {
          throw new HttpError(415, "Content-Type must be application/json");
        }
        const body = await readJsonBody(request);
        if (body === null || typeof body !== "object" || Array.isArray(body)) {
          throw new HttpError(400, "Request body must be a JSON object");
        }
        const reviewer = typeof body.reviewer === "string" ? body.reviewer.trim() : "";
        const comment = typeof body.comment === "string" ? body.comment.trim() : "";
        if (
          reviewer.length < 1 ||
          reviewer.length > 80 ||
          !Number.isInteger(body.rating) ||
          body.rating < 1 ||
          body.rating > 5 ||
          comment.length < 1 ||
          comment.length > 1000
        ) {
          throw new HttpError(400, "Provide reviewer, rating (1-5), and comment within the allowed lengths");
        }
        // Use writePool (:3306 primary writer) + causal read consistency for write-path validation
        const [matches] = await writePool.execute("SELECT @@hostname AS dbNode FROM products WHERE sku = ? LIMIT 1", [
          reviewMatch[1],
        ]);
        const dbNode = matches[0]?.dbNode || "galera";
        trace.push(`database-lb:write (${dbNode})`);
        if (matches.length === 0) {
          throw new HttpError(404, "Product not found", trace);
        }
        const review = {
          sku: reviewMatch[1],
          reviewer,
          rating: body.rating,
          comment,
          createdAt: new Date(),
        };
        const result = await reviews.insertOne(review);
        const helloInfo = await mongo.db().command({ hello: 1 }).catch(() => ({ me: "rs0-primary" }));
        const mongoPrimary = (helloInfo?.me || "rs0-primary").split(":")[0];
        sendJson(
          response,
          201,
          { id: result.insertedId.toString(), ...review },
          [...trace, `mongodb-rs0:primary (${mongoPrimary})`],
        );
        return;
      }

      sendJson(response, 404, { error: "Not found" }, trace);
    })().catch((error) => {
      if (!(error instanceof HttpError)) {
        console.error("Request failed:", error.message);
      }
      if (response.headersSent) {
        response.destroy();
        return;
      }
      sendJson(
        response,
        error instanceof HttpError ? error.statusCode : 503,
        { error: error instanceof HttpError ? error.message : "Service temporarily unavailable" },
        error instanceof HttpError && error.trace ? error.trace : [...trace, "dependency-unavailable"],
      );
    });
  });

  server.listen(8080, "0.0.0.0", () => {
    console.log(
      `Store catalog API listening on port 8080 (readPool=${readPoolLimit}, writePool=${writePoolLimit}, queue=${poolQueueLimit})`,
    );
  });

  const shutdown = () => {
    server.close(() => {
      void Promise.all([readPool.end(), writePool.end(), mongo.close(), redis.quit().catch(() => {})]).then(() =>
        process.exit(0),
      );
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

start().catch((error) => {
  console.error("Application startup failed:", error);
  process.exitCode = 1;
});
