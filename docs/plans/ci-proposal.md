# Proposal: `.forgejo/workflows/ci.yml` (stage B0, task T2)

`sds-ci` lets only a person write `.forgejo/`. This file is the proposal. Copy
the YAML below to `.forgejo/workflows/ci.yml` in an `ops` commit. Then delete
this file.

## What each job runs

| Job | Runs | Closes |
|---|---|---|
| `static` | `toolchain:check`, `typecheck`, `lint` | FND-02 rule 1 step 1 |
| `unit` | `test` (unit and component) | FND-02 rule 1 step 2 |
| `build` | `build` | FND-02 rule 1 step 3 |
| `integration` | `test:integration` against Postgres 16 and Redis 7 services | FND-02 rule 1 step 4 |
| `e2e` | `build`, then `test:e2e` | FND-02 rule 1 step 4 |
| `pipeline` | `test:pipeline` (it also runs `db:check`, FND-06.AC1) | FND-02 rule 2 |
| `specs` | the `sds-planning` checker over the test folders only (R-037) | FND-02.AC2 |
| `commits` | the commit check of the `bioeksen-sds` kit | FND-02.AC3 |
| `audit` | `deps:audit` (`pnpm audit --audit-level high`, with the overrides and the one ignore of DEC-134) | FND-07.AC5 |
| `ci` | fails if any job above failed | the one required check of `main` (FND-02 rule 3) |

On a feature branch, red acceptance tests are expected until the stage
exits. They do not block, because only `main` requires the `ci` check
(`sds-ci`, **Gating the test-first loop**).

## Open points (fill before you commit)

1. **The CI image.** `sds-ci` says the toolchain comes from the estate CI
   image, pinned by digest. Replace `CI_IMAGE@sha256:DIGEST` with it. The
   image must hold Node 24, pnpm 12.11.2, Python 3, the Chromium of
   `@playwright/test` 1.64, and the `bioeksen-sds` release under
   `/opt/bioeksen-sds/<tag>/`.
2. **The kit release pin.** `sds-ci` says `.claude/settings.json` pins the
   `bioeksen-sds` release. Today it does not (the marketplace has
   `autoUpdate: true` and no version). The YAML uses `SDS_TAG: "0.9.0"`, the
   release in use on 2026-10-22. Add the pin to `.claude/settings.json`, and
   keep the two equal.
3. **The commit check script.** Release 0.9.0 of the kit has no commit check
   script (only `mint_change_id.py`, `check_specs.py` and `check_service.py`).
   The `commits` step names `check_commits.py` as a placeholder. Until the kit
   has the script, the step reports "not run" and fails, as `sds-ci` says.
   Ask the SDS owner for the script name.
4. **Upload of artifacts.** Forgejo does not support
   `actions/upload-artifact` v4. The YAML uses v3.2.1. Change it if your
   forge version supports v4.
5. **Branch protection** of `main`: require the check `ci`. This is a forge
   setting, not a file.

## YAML

```yaml
# The pull request pipeline of Bioeksen Portal (FND-02, sds-ci).
# Each job runs a project script. A person changes this file, in an ops commit.
name: ci

on:
  pull_request:
  push:
    branches: [main, "feature/**"]

env:
  NEXT_TELEMETRY_DISABLED: "1"
  SDS_TAG: "0.9.0"

jobs:
  static:
    runs-on: ci
    container:
      image: CI_IMAGE@sha256:DIGEST
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
      - run: pnpm install --frozen-lockfile
      - run: pnpm run toolchain:check
      - run: pnpm run typecheck
      - run: pnpm run lint

  unit:
    needs: static
    runs-on: ci
    container:
      image: CI_IMAGE@sha256:DIGEST
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
      - run: pnpm install --frozen-lockfile
      - run: pnpm run test

  build:
    needs: unit
    runs-on: ci
    container:
      image: CI_IMAGE@sha256:DIGEST
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build

  integration:
    needs: build
    runs-on: ci
    container:
      image: CI_IMAGE@sha256:DIGEST
    timeout-minutes: 30
    services:
      postgres:
        image: postgres@sha256:9e2cf6287f25c3151f4c9421ccce2b17f3e60061c111a29165e0d2cdd9ff0a97 # 16
        env:
          POSTGRES_HOST_AUTH_METHOD: trust
      redis:
        image: redis@sha256:44960b3100c48159a66d28c18b0588c193492e25f7551d60e51dd464fc3eca5b # 7
    env:
      TEST_DATABASE_URL: postgresql://postgres@postgres:5432/bioeksen_portal_ci_integration
      TEST_DATABASE_HOSTS: postgres
      TEST_REDIS_URL: redis://redis:6379
    steps:
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
      - run: pnpm install --frozen-lockfile
      - run: pnpm run test:integration

  e2e:
    needs: build
    runs-on: ci
    container:
      image: CI_IMAGE@sha256:DIGEST
    timeout-minutes: 40
    services:
      postgres:
        image: postgres@sha256:9e2cf6287f25c3151f4c9421ccce2b17f3e60061c111a29165e0d2cdd9ff0a97 # 16
        env:
          POSTGRES_HOST_AUTH_METHOD: trust
      redis:
        image: redis@sha256:44960b3100c48159a66d28c18b0588c193492e25f7551d60e51dd464fc3eca5b # 7
    env:
      TEST_E2E_DATABASE_URL: postgresql://postgres@postgres:5432/bioeksen_portal_ci_e2e
      TEST_DATABASE_HOSTS: postgres
      TEST_REDIS_URL: redis://redis:6379
    steps:
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm run test:e2e
      - if: failure()
        uses: actions/upload-artifact@ff15f0306b3f739f7b6fd43fb5d26cd321bd4de5 # v3.2.1
        with:
          name: e2e-results
          path: test-results/
          retention-days: 14

  pipeline:
    needs: build
    runs-on: ci
    container:
      image: CI_IMAGE@sha256:DIGEST
    timeout-minutes: 45
    services:
      postgres:
        image: postgres@sha256:9e2cf6287f25c3151f4c9421ccce2b17f3e60061c111a29165e0d2cdd9ff0a97 # 16
        env:
          POSTGRES_HOST_AUTH_METHOD: trust
    env:
      TEST_DATABASE_URL: postgresql://postgres@postgres:5432/bioeksen_portal_ci_integration
      TEST_DATABASE_HOSTS: postgres
      SDS_PLANNING_CHECKER: /opt/bioeksen-sds/0.9.0/skills/sds-planning/scripts/check_specs.py
    steps:
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
      - run: pnpm install --frozen-lockfile
      - run: pnpm run test:pipeline

  specs:
    runs-on: ci
    container:
      image: CI_IMAGE@sha256:DIGEST
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
      - run: python3 "/opt/bioeksen-sds/${SDS_TAG}/skills/sds-planning/scripts/check_specs.py" --specs docs/specs --tests tests/unit tests/integration tests/pipeline tests/e2e tests/smoke

  commits:
    if: github.event_name == 'pull_request'
    runs-on: ci
    container:
      image: CI_IMAGE@sha256:DIGEST
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
        with:
          fetch-depth: 0
      - name: commit check of the bioeksen-sds kit
        env:
          BASE_REF: ${{ github.base_ref }}
        run: |
          kit_check="/opt/bioeksen-sds/${SDS_TAG}/skills/sds-commit/scripts/check_commits.py"
          if [ ! -f "$kit_check" ]; then
            echo "not run: the bioeksen-sds kit ${SDS_TAG} has no commit check at $kit_check"
            exit 1
          fi
          python3 "$kit_check" --range "origin/${BASE_REF}..HEAD"

  audit:
    runs-on: ci
    container:
      image: CI_IMAGE@sha256:DIGEST
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
      - run: pnpm run deps:audit

  ci:
    if: always()
    needs: [static, unit, build, integration, e2e, pipeline, specs, commits, audit]
    runs-on: ci
    timeout-minutes: 5
    steps:
      - name: every job passed or was skipped
        env:
          RESULTS: ${{ join(needs.*.result, ' ') }}
        run: |
          for result in $RESULTS; do
            case "$result" in
              success|skipped) ;;
              *) echo "a job ended as $result"; exit 1 ;;
            esac
          done
```
