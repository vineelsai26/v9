import * as Redacted from "effect/Redacted";

export interface RelayDatabaseOrigin {
  readonly scheme: "postgres" | "postgresql";
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: Redacted.Redacted<string>;
  /** libpq semantics: `require` encrypts without verifying, which self-signed servers need. */
  readonly tls: "disable" | "require" | "verify-full";
}

/** Returns the origin, or why the URL is unusable. */
export function parseRelayDatabaseUrl(
  url: Redacted.Redacted<string>,
): RelayDatabaseOrigin | string {
  let parsed: URL;
  try {
    parsed = new URL(Redacted.value(url));
  } catch {
    return "not a URL";
  }
  const scheme = parsed.protocol.slice(0, -1);
  if (scheme !== "postgres" && scheme !== "postgresql") {
    return "expected a postgres:// or postgresql:// URL";
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  const user = decodeURIComponent(parsed.username);
  if (!parsed.hostname || !database || !user || !parsed.password) {
    return "expected a host, database, user, and password";
  }
  return {
    scheme,
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database,
    user,
    password: Redacted.make(decodeURIComponent(parsed.password)),
    tls: tlsMode(parsed.searchParams.get("sslmode")),
  };
}

function tlsMode(sslmode: string | null): RelayDatabaseOrigin["tls"] {
  if (sslmode === "disable") return "disable";
  if (sslmode === "allow" || sslmode === "prefer" || sslmode === "require") return "require";
  return "verify-full";
}
