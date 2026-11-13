// @effect-diagnostics nodeBuiltinImport:off - one sha256 that keys the migration action to the database URL without persisting it.
import * as NodeCrypto from "node:crypto";

import * as PgClient from "@effect/sql-pg/PgClient";
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Drizzle from "@alchemy.run/drizzle";
import * as Alchemy from "alchemy";
import type { EffectPgDatabase } from "drizzle-orm/effect-postgres";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Console from "effect/Console";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { parseRelayDatabaseUrl } from "./dbConfig.ts";

export class RelayDb extends Context.Service<
  RelayDb,
  EffectPgDatabase & {
    readonly $client: PgClient.PgClient;
  }
>()("t3code-relay/db/RelayDb") {}

export class RelayTransactions extends Context.Service<
  RelayTransactions,
  {
    readonly withTransaction: RelayDb["Service"]["$client"]["withTransaction"];
  }
>()("t3code-relay/db/RelayTransactions") {
  static readonly layer = Layer.effect(
    RelayTransactions,
    Effect.gen(function* () {
      const db = yield* RelayDb;
      return RelayTransactions.of({
        withTransaction: db.$client.withTransaction,
      });
    }),
  );
}

const RelayDatabaseOrigin = Config.Redacted("RELAY_DATABASE_URL").pipe(
  Config.mapEffect((url) => {
    const origin = parseRelayDatabaseUrl(url);
    return typeof origin === "string"
      ? Effect.fail(
          new Config.ConfigError(
            new ConfigProvider.SourceError({ message: `RELAY_DATABASE_URL is invalid: ${origin}` }),
          ),
        )
      : Effect.succeed(origin);
  }),
);

const MIGRATIONS_TABLE = "relay_migrations";

/** Applies pending migrations to RELAY_DATABASE_URL on deploy. Each stage needs its own database. */
const MigrateRelayDatabase = Alchemy.Action(
  "MigrateRelayDatabase",
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const origin = yield* RelayDatabaseOrigin;
    const migrationsFolder = yield* path.fromFileUrl(
      new URL("../migrations/postgres", import.meta.url),
    );
    return Effect.fn(function* (_input: {
      readonly databaseDigest: string;
      readonly migrations: ReadonlyArray<string>;
      readonly snapshotHash: string;
    }) {
      yield* Effect.gen(function* () {
        const db = yield* PgDrizzle.makeWithDefaults();
        yield* migrate(db, { migrationsFolder, migrationsTable: MIGRATIONS_TABLE });
      }).pipe(
        Effect.provide(
          PgClient.layer({
            host: origin.host,
            port: origin.port,
            database: origin.database,
            username: origin.user,
            password: origin.password,
            ssl:
              origin.tls === "disable"
                ? false
                : { rejectUnauthorized: origin.tls === "verify-full", servername: origin.host },
          }),
        ),
        Effect.scoped,
      );
      yield* Console.log(`Applied relay migrations to ${origin.host}/${origin.database}`);
      return { migrationsTable: MIGRATIONS_TABLE };
    });
  }),
);

export const RelayDatabase = Effect.gen(function* () {
  const schema = yield* Drizzle.Schema("RelaySchema", {
    schema: "./src/persistence/schema.ts",
    out: "./migrations/postgres",
    dialect: "postgres",
  });
  const origin = yield* RelayDatabaseOrigin;
  const databaseDigest = NodeCrypto.createHash("sha256")
    .update(`${origin.host}:${origin.port}/${origin.database}`)
    .digest("hex");
  yield* MigrateRelayDatabase({
    databaseDigest,
    migrations: schema.migrations,
    snapshotHash: schema.snapshotHash,
  });
  return { host: origin.host, database: origin.database };
});

/** A database on a private network: Hyperdrive reaches it through a Workers VPC service on this tunnel. */
const RelayDatabaseTunnel = Config.all({
  tunnelId: Config.NonEmptyString("RELAY_DATABASE_TUNNEL_ID"),
  host: Config.option(Config.NonEmptyString("RELAY_DATABASE_TUNNEL_HOST")),
  port: Config.option(Config.Port("RELAY_DATABASE_TUNNEL_PORT")),
}).pipe(Config.option);

export const RelayHyperdrive = Effect.gen(function* () {
  const origin = yield* RelayDatabaseOrigin;
  const tunnel = yield* RelayDatabaseTunnel;
  const credentials = {
    scheme: origin.scheme,
    database: origin.database,
    user: origin.user,
    password: origin.password,
  };
  if (Option.isNone(tunnel)) {
    return yield* Cloudflare.Hyperdrive.Connection("RelayHyperdrive", {
      origin: { ...credentials, host: origin.host, port: origin.port },
      caching: { disabled: true },
      originConnectionLimit: 40,
    });
  }
  const host = Option.getOrElse(tunnel.value.host, () => origin.host);
  const service = yield* Cloudflare.Connectivity.DirectoryService("RelayDatabaseService", {
    type: "tcp",
    appProtocol: "postgresql",
    tcpPort: Option.getOrElse(tunnel.value.port, () => origin.port),
    host: isIpv4(host)
      ? { ipv4: host, network: { tunnelId: tunnel.value.tunnelId } }
      : { hostname: host, resolverNetwork: { tunnelId: tunnel.value.tunnelId } },
  });
  return yield* Cloudflare.Hyperdrive.Connection("RelayHyperdrive", {
    origin: { ...credentials, serviceId: service.serviceId },
    caching: { disabled: true },
    originConnectionLimit: 40,
  });
});

const isIpv4 = (host: string) => /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host);
