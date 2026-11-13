# T3 Code (fork)

A personal build of [T3 Code](https://github.com/pingdotgg/t3code) with extra features layered on top.

## Branches

- `main` mirrors `pingdotgg/t3code:main`. Never commit to it.
- `feat/<name>` holds one feature, based on `main`. Rebase it onto `main` when upstream moves.
- `fork` (this branch, the default) holds only the release workflow and `features.txt`.
- `fork-build` is the last merged build. Release workflow output, not for editing.

## Releases

[`fork-release.yml`](.github/workflows/fork-release.yml) runs daily and on demand. It syncs `main`,
merges each branch in [`features.txt`](features.txt) in order, builds, redeploys the relay, and publishes a
nightly-versioned prerelease for Linux x64, macOS arm64 and Windows x64. The daily run skips the build when
nothing changed; a manual run always builds. A feature that no longer merges fails the run and names the branch.

It is the only workflow that runs here. Upstream's workflows arrive with `main` and are disabled; one upstream
adds later gets its first run cancelled and is disabled by the next release run.

Installed builds update from this repository's releases. Keep the app's update channel on Nightly.

The workflow needs a `FORK_SYNC_TOKEN` secret: a fine-grained token for this repository with Contents and
Workflows read/write. Without it, a sync that brings in upstream workflow changes fails.

## Adding a feature

```sh
git fetch origin
git switch -c feat/my-thing origin/main
# ...work, commit...
git push -u origin feat/my-thing
```

Then add `feat/my-thing` to `features.txt` on this branch.

## T3 Connect

`feat/custom-cloudflare-connect` lets `infra/relay` deploy to any Cloudflare account with any Postgres,
without PlanetScale or Axiom. This fork's relay runs at `https://relay.vineelsai.com`, with its database on
the docker VM behind the `docker-vm` tunnel (Fleet `stacks/t3-relay-db`). The release workflow's `relay` job
redeploys it from each release's merged commit before publishing.

Repository variables (public values baked into builds): `T3CODE_RELAY_URL`, `T3CODE_CLERK_PUBLISHABLE_KEY`,
`T3CODE_CLERK_JWT_TEMPLATE`, and optionally `T3CODE_CLERK_CLI_OAUTH_CLIENT_ID`. Unset `T3CODE_RELAY_URL` to
release without T3 Connect.

Repository secret `RELAY_DEPLOY_ENV`: the relay's deploy env file (`infra/relay/.env.example` on that
branch), including the Cloudflare token, Clerk secret key, and database URL.

The runner cannot reach the database, so a release that adds relay migrations fails its `relay` job before
deploying anything. Deploy that ref from the LAN, then re-run the job:

```sh
git switch --detach <ref from the failed job>
cd infra/relay
./node_modules/.bin/alchemy deploy --stage prod --env-file <your relay.env> --yes
```

`t3 connect login` on a machine without a browser needs a Clerk OAuth application with the device grant
(`T3CODE_CLERK_CLI_OAUTH_CLIENT_ID`). Sign in from the desktop app otherwise.

## Limitations

- macOS builds are unsigned: clear quarantine with `xattr -cr "/Applications/T3 Code (Nightly).app"` after
  installing, and they cannot auto-update. Windows builds are unsigned and show a SmartScreen prompt.
- SSH remote installs download the CLI from upstream releases by version, which do not exist for fork versions.
- app.t3.codes and the store mobile app are upstream builds; fork-only UI does not appear there.
- Do not install upstream's desktop app alongside this one; both use `~/.t3`.
