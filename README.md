# T3 Code (fork)

A personal build of [T3 Code](https://github.com/pingdotgg/t3code) with extra features layered on top.

## Branches

- `main` mirrors `pingdotgg/t3code:main`. Never commit to it.
- `feat/<name>` holds one feature, based on `main`. Rebase it onto `main` when upstream moves.
- `fork` (this branch, the default) holds only the release workflow and `features.txt`.
- `fork-build` is the last merged build. Release workflow output, not for editing.

## Releases

[`fork-release.yml`](.github/workflows/fork-release.yml) runs daily and on demand. It syncs `main`,
merges each branch in [`features.txt`](features.txt) in order, typechecks, and publishes a nightly-versioned
prerelease for Linux x64, macOS arm64 and Windows x64. The daily run skips the build when nothing changed;
a manual run always builds. A feature that no longer merges fails the run and names the branch.

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

## Limitations

- No T3 Connect: its config belongs to upstream's production deployment. LAN and Tailscale work.
- macOS builds are unsigned: clear quarantine with `xattr -cr "/Applications/T3 Code (Nightly).app"` after
  installing, and they cannot auto-update. Windows builds are unsigned and show a SmartScreen prompt.
- SSH remote installs download the CLI from upstream releases by version, which do not exist for fork versions.
- app.t3.codes and the store mobile app are upstream builds; fork-only UI does not appear there.
- Do not install upstream's desktop app alongside this one; both use `~/.t3`.
