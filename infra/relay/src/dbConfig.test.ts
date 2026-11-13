import * as Redacted from "effect/Redacted";
import { describe, expect, it } from "vite-plus/test";

import { parseRelayDatabaseUrl } from "./dbConfig.ts";

const parse = (url: string) => parseRelayDatabaseUrl(Redacted.make(url));

describe("parseRelayDatabaseUrl", () => {
  it("splits a hosted Postgres URL into a Hyperdrive origin", () => {
    const origin = parse(
      "postgresql://relay%40app:p%40ss%2Fword@ep-x.us-west-2.aws.neon.tech/relay?sslmode=require&channel_binding=require",
    );
    expect(origin).toMatchObject({
      scheme: "postgresql",
      host: "ep-x.us-west-2.aws.neon.tech",
      port: 5432,
      database: "relay",
      user: "relay@app",
      tls: "require",
    });
    expect(typeof origin === "string" ? origin : Redacted.value(origin.password)).toBe("p@ss/word");
  });

  it("keeps an explicit port and maps sslmode to a TLS mode", () => {
    expect(parse("postgres://u:p@localhost:6543/db?sslmode=disable")).toMatchObject({
      port: 6543,
      tls: "disable",
    });
    expect(parse("postgres://u:p@db/db")).toMatchObject({ tls: "verify-full" });
    expect(parse("postgres://u:p@db/db?sslmode=verify-ca")).toMatchObject({ tls: "verify-full" });
  });

  it.each([
    ["not a url", "not a URL"],
    ["mysql://u:p@host/db", "expected a postgres:// or postgresql:// URL"],
    ["postgres://u@host/db", "expected a host, database, user, and password"],
    ["postgres://u:p@host/", "expected a host, database, user, and password"],
  ])("rejects %s", (url, reason) => {
    expect(parse(url)).toBe(reason);
  });
});
