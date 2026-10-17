# Releasing

Releases are signed by Mozilla (AMO) on the **unlisted** channel and published as GitHub releases. Installed copies check `browser_specific_settings.gecko.update_url`, which points at `releases/latest/download/updates.json`, so a new release reaches phones without touching the manifest.

## One-time setup

Create API credentials at <https://addons.mozilla.org/en-US/developers/addon/api/key/> and add them as repository secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`.

## Cutting a release

Merging a PR into `main` releases automatically. The PR's labels pick the bump:

| Label           | Result                     |
|-----------------|----------------------------|
| *(none)*        | patch, e.g. 0.1.4 -> 0.1.5 |
| `release:minor` | minor, e.g. 0.1.4 -> 0.2.0 |
| `release:major` | major, e.g. 0.1.4 -> 1.0.0 |
| `release:skip`  | no release                 |

Changes that only touch `README.md`, `RELEASING.md`, `LICENSE`, `.github/`, `upgrade.sh` or `.gitignore` never release. A direct push to `main` releases as a patch. The workflow creates the labels itself on first run.

To release without a merge, use **Actions → Release → Run workflow** and pick `patch`, `minor` or `major`. Pushing a `v*` tag by hand also works, for when the exact number matters.

The workflow works out the next version from the latest `v*` tag (or `manifest.json` if there is none), writes it into the manifest, signs on AMO, commits the bump, tags it, and publishes a release holding the `.xpi` and `updates.json`.

AMO rate-limits submissions to 24 per day, 20 per hour and 3 per minute, and counts failed attempts, so label a PR `release:skip` when it doesn't need to reach the phone.

## Local build

`./upgrade.sh --help` bumps the version, lints, packages (`dist/`), signs (`--sign`, needs the two env vars) or launches Firefox (`--run`). Because the addon is self-hosted, `web-ext lint` needs `--self-hosted`; without it `update_url` is rejected as `MANIFEST_UPDATE_URL`.

The `Build` workflow lints and packages every push and pull request without any secrets, and uploads the zip as an artifact.

## Temporary install over USB

Loads the extension unsigned; it is discarded when Firefox restarts.

```sh
adb devices
web-ext run -t firefox-android --adb-device <device-id> --firefox-apk org.mozilla.firefox
```

Needs USB debugging in Android developer options and **Remote debugging via USB** in Firefox's settings, with at least one tab open. Use `org.mozilla.firefox_beta` or `org.mozilla.fenix` for Beta and Nightly.
