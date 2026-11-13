// @effect-diagnostics anyUnknownInErrorContext:off layerMergeAllWithDependencies:off - Alchemy provider helpers expose framework-owned any requirements.
import * as Alchemy from "alchemy";
import * as Output from "alchemy/Output";
import * as Axiom from "@alchemy.run/axiom";
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Drizzle from "@alchemy.run/drizzle";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Planetscale from "@alchemy.run/planetscale";

import { PublishClientConfig, tokenDigest } from "./src/clientConfig.ts";
import * as RelayDb from "./src/db.ts";
import { MobileSourceMapsUploadCredentials, RelayObservability } from "./src/observability.ts";
import { isPreviewStage } from "./src/previewStages.ts";
import { PreviewTunnelSweep, PreviewTunnelSweepProvider } from "./src/previewTunnelSweep.ts";
import { ManagedEndpointZone, RelayApiZone, RelayDeploymentConfig } from "./src/zone.ts";
import * as RelayWorker from "./src/worker.ts";

export default Alchemy.Stack(
  "T3CodeRelay",
  {
    providers: Layer.mergeAll(
      Axiom.providers(),
      Cloudflare.providers(),
      Drizzle.providers(),
      Planetscale.providers(),
      PreviewTunnelSweepProvider(),
    ),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    const db = yield* RelayDb.RelayDatabase;
    const hyperdrive = yield* RelayDb.RelayHyperdrive;
    const managedEndpointZone = yield* ManagedEndpointZone.pipe(Effect.orDie);
    const relayApiZone = yield* RelayApiZone.pipe(Effect.orDie);
    const observability = yield* RelayObservability;
    const api = yield* RelayWorker.Api;
    if (isPreviewStage(stage)) {
      const { managedEndpointZoneName } = yield* RelayDeploymentConfig;
      yield* PreviewTunnelSweep("PreviewTunnelSweep", {
        stage,
        tunnelZoneName: managedEndpointZoneName,
        workerName: api.workerName,
      });
    }
    const tracing = observability
      ? {
          mobileTracingUrl: observability.traces.otelTracesEndpoint,
          mobileTracingDataset: observability.traces.name,
          mobileTracingToken: observability.mobileIngestToken.token,
          clientTracingUrl: observability.traces.otelTracesEndpoint,
          clientTracingDataset: observability.traces.name,
          clientTracingToken: observability.clientIngestToken.token,
        }
      : undefined;
    yield* PublishClientConfig(
      observability && tracing
        ? {
            url: api.url,
            ...tracing,
            tokenDigest: Output.map(
              Output.all(
                observability.mobileIngestToken.token,
                observability.clientIngestToken.token,
              ),
              tokenDigest,
            ),
          }
        : { url: api.url },
    );

    return {
      databaseHost: db.host,
      databaseName: db.database,
      hyperdriveName: hyperdrive.name,
      workerName: api.workerName,
      url: api.url,
      relayApiZoneId: relayApiZone.zoneId,
      managedEndpointZoneId: managedEndpointZone.zoneId,
      ...(observability && tracing
        ? {
            ...tracing,
            mobileLogsDataset: observability.mobileLogs.name,
            mobileMetricsDataset: observability.mobileMetrics.name,
            mobileSourceMapsBucket: observability.mobileSourceMaps.bucketName,
            // The MOBILE_SOURCEMAPS_R2 secret for GitHub Actions and EAS Build.
            mobileSourceMapsUploadCredentials: yield* MobileSourceMapsUploadCredentials,
          }
        : {}),
    };
  }).pipe(Effect.provide(RelayWorker.layer)),
);
