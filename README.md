# Open Telemetry CI/CD Action

[![Unit Tests][ci-img]][ci]
![GitHub License][license-img]

This action exports Github CI/CD workflows to any endpoint compatible with OpenTelemetry.

This is a fork of [otel-export-trace-action](https://github.com/inception-health/otel-export-trace-action) with more features and better support.

Compliant with OpenTelemetry [CICD semconv](https://opentelemetry.io/docs/specs/semconv/attributes-registry/cicd/).
Look at [Sample OpenTelemetry Output](./src/__assets__/output_success.txt) for the list of attributes and their values.

![Example](./docs/honeycomb-example.png)

## Usage

We provide sample code for popular platforms. If you feel one is missing, please open an issue.

| Code Sample                 | File                                             |
| --------------------------- | ------------------------------------------------ |
| Inside an existing workflow | [build.yml](.github/workflows/build.yml)         |
| From a private repository   | [private.yml](.github/workflows/private.yml)     |
| Axiom                       | [axiom.yml](.github/workflows/axiom.yml)         |
| New Relic                   | [newrelic.yml](.github/workflows/newrelic.yml)   |
| Honeycomb                   | [honeycomb.yml](.github/workflows/honeycomb.yml) |
| Dash0                       | [dash0.yml](.github/workflows/dash0.yml)         |
| Jaeger                      | WIP                                              |
| Grafana                     | WIP                                              |

### On workflow_run event

[workflow_run github documentation](<https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#workflow_run>)

```yaml
on:
  workflow_run:
    workflows:
      # The name of the workflow(s) that triggers the export
      - "Build"
    types: [completed]

jobs:
  otel-cicd-actions:
    runs-on: ubuntu-latest
    steps:
      - uses: corentinmusard/otel-cicd-action@v2
        with:
          otlpEndpoint: grpc://api.honeycomb.io:443/
          otlpHeaders: ${{ secrets.OTLP_HEADERS }}
          githubToken: ${{ secrets.GITHUB_TOKEN }}
          runId: ${{ github.event.workflow_run.id }}
```

### Inside an existing workflow

```yaml
jobs:
  build:
    # ... existing code
  otel-cicd-action:
    if: always()
    name: OpenTelemetry Export Trace
    runs-on: ubuntu-latest
    needs: [build] # must run when all jobs are completed
    steps:
      - name: Export workflow
        uses: corentinmusard/otel-cicd-action@v2
        with:
          otlpEndpoint: grpc://api.honeycomb.io:443/
          otlpHeaders: ${{ secrets.OTLP_HEADERS }}
          githubToken: ${{ secrets.GITHUB_TOKEN }}
```

### `On workflow_run event` vs `Inside an existing workflow`

Both methods must be run when the workflow is completed, otherwise, the trace will be incomplete.

| Differences                                         | On workflow_run event | Inside an existing workflow |
| --------------------------------------------------- | --------------------- | --------------------------- |
| Shows in PR page                                    | No                    | Yes                         |
| Shows in Actions tab                                | Yes                   | Yes                         |
| Needs extra consideration to be run as the last job | No                    | Yes                         |
| Must be duplicated for multiple workflows           | No                    | Yes                         |

### Private Repository

If you are using a private repository, you need to set the following permissions in your workflow file.
It can be done at the global level or at the job level.

```yaml
permissions:
  contents: read # Required. To access the private repository
  actions: read # Required. To read workflow runs
  pull-requests: read # Optional. To read PR labels
  checks: read # Optional. To read run annotations
```

### Adding arbitrary resource attributes

You can use `extraAttributes` to set any additional string resource attributes.
Attributes are splitted on `,` and then each key/value are splitted on the first `=`.

```yaml
- name: Export workflow
  uses: corentinmusard/otel-cicd-action@v2
  with:
    otlpEndpoint: "CHANGE ME"
    otlpHeaders: "CHANGE ME"
    githubToken: ${{ secrets.GITHUB_TOKEN }}
    extraAttributes: "extra.attribute=1,key2=value2"
```

### Dynamic Span Parameters

You can add custom attributes to specific spans by printing special tags in your workflow steps. This allows you to add metrics, custom data, or any contextual information to your traces dynamically at runtime.

#### Step-level parameters

Add attributes to individual step spans:

```yaml
- name: Build application
  run: |
    npm run build
    BUILD_SIZE=$(du -sh dist | cut -f1)
    echo "<span-parameter key=\"build.size\" value=\"$BUILD_SIZE\"/>"
    echo "<span-parameter key=\"build.timestamp\" value=\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"/>"
```

#### Job-level parameters

Add attributes that apply to the entire job span:

```yaml
- name: Run tests
  run: |
    npm test
    TEST_COUNT=$(grep -c "test(" test/*.js || echo "0")
    echo "<job-parameter key=\"test.total_count\" value=\"$TEST_COUNT\"/>"
```

#### Workflow-level parameters

Add attributes that apply to the root workflow span:

```yaml
- name: Set version
  run: |
    VERSION=$(cat package.json | jq -r .version)
    echo "<workflow-parameter key=\"app.version\" value=\"$VERSION\"/>"
    echo "<workflow-parameter key=\"deployment.environment\" value=\"production\"/>"
```

#### Complete example

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build
        run: |
          npm run build
          echo "<span-parameter key=\"build.duration\" value=\"42s\"/>"
          echo "<job-parameter key=\"job.artifacts_count\" value=\"3\"/>"
          echo "<workflow-parameter key=\"release.version\" value=\"1.2.3\"/>"

      - name: Test
        run: |
          npm test
          echo "<span-parameter key=\"test.passed\" value=\"150\"/>"
          echo "<span-parameter key=\"test.failed\" value=\"0\"/>"

  export-trace:
    if: always()
    needs: [build]
    runs-on: ubuntu-latest
    steps:
      - uses: corentinmusard/otel-cicd-action@v2
        with:
          otlpEndpoint: ${{ secrets.OTLP_ENDPOINT }}
          otlpHeaders: ${{ secrets.OTLP_HEADERS }}
          githubToken: ${{ secrets.GITHUB_TOKEN }}
```

#### Tag formats

- `<span-parameter key="name" value="value"/>` - Step span (default)
- `<step-parameter key="name" value="value"/>` - Step span (explicit)
- `<job-parameter key="name" value="value"/>` - Job span
- `<workflow-parameter key="name" value="value"/>` - Workflow span

Parameters bubble up to their target span and appear as attributes in your observability platform.

#### Important notes

**Timing considerations:**
- Dynamic parameters work best when using the `workflow_run` event pattern
- When running inside an existing workflow (as a final job), job logs may not be immediately available
- The GitHub API sometimes returns 404 for job logs that haven't been finalized yet
- If logs aren't available, the feature gracefully continues without parameters

**Recommended usage pattern:**
```yaml
# Separate workflow that runs after the main workflow completes
on:
  workflow_run:
    workflows: ["Main Workflow"]
    types: [completed]

jobs:
  export-trace:
    runs-on: ubuntu-latest
    steps:
      - uses: corentinmusard/otel-cicd-action@v2
        with:
          otlpEndpoint: ${{ secrets.OTLP_ENDPOINT }}
          otlpHeaders: ${{ secrets.OTLP_HEADERS }}
          githubToken: ${{ secrets.GITHUB_TOKEN }}
          runId: ${{ github.event.workflow_run.id }}
```

#### Disabling log parsing

If you don't need dynamic parameters or want to optimize performance, you can disable log parsing:

```yaml
- uses: corentinmusard/otel-cicd-action@v2
  with:
    otlpEndpoint: ${{ secrets.OTLP_ENDPOINT }}
    otlpHeaders: ${{ secrets.OTLP_HEADERS }}
    githubToken: ${{ secrets.GITHUB_TOKEN }}
    parseLogParameters: "false"
```

### Action Inputs

| name            | description                                                                                                 | required | default                               | example                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------- | ---------------------------------------------------------------- |
| otlpEndpoint    | The destination endpoint to export OpenTelemetry traces to. It supports `https://`, `http://` and `grpc://` endpoints. | true     |                                       | `https://api.axiom.co/v1/traces`                                 |
| otlpHeaders     | Headers to add to the OpenTelemetry exporter .                                                              | true     |                                       | `x-honeycomb-team=YOUR_API_KEY,x-honeycomb-dataset=YOUR_DATASET` |
| otelServiceName | OpenTelemetry service name                                                                                  | false    | `<The name of the exported workflow>` | `Build CI`                                                       |
| githubToken     | The repository token with Workflow permissions. Required for private repos                                  | false    |                                       | `${{ secrets.GITHUB_TOKEN }}`                                    |
| runId           | Workflow Run ID to Export                                                                                   | false    | env.GITHUB_RUN_ID                     | `${{ github.event.workflow_run.id }}`                            |
| extraAttributes | Extra resource attributes to add to each span | false |  | extra.attribute=1,key2=value2 |
| parseLogParameters | Enable parsing span parameters from job logs | false | true | false |

### Action Outputs

| name    | description                                 |
| ------- | ------------------------------------------- |
| traceId | The OpenTelemetry Trace ID of the root span |

[ci-img]: https://github.com/corentinmusard/otel-cicd-action/actions/workflows/build.yml/badge.svg?branch=main
[ci]: https://github.com/corentinmusard/otel-cicd-action/actions/workflows/build.yml?query=branch%3Amain
[license-img]: https://img.shields.io/github/license/corentinmusard/otel-cicd-action
