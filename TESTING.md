# Testing Dynamic Span Parameters

This document explains how to test the dynamic span parameters feature.

## Automated Testing

### GitHub Actions Workflow

The repository includes a dedicated test workflow (`.github/workflows/test-dynamic-parameters.yml`) that validates the dynamic parameters feature:

**Test Jobs:**
1. **test-job** - Runs a workflow with various dynamic parameters:
   - Step-level parameters (build metrics, test results)
   - Job-level parameters (test type, coverage, artifact count)
   - Workflow-level parameters (version, environment, quality gates)

2. **export-and-validate** - Exports the trace and validates:
   - Trace ID is generated
   - Export completes successfully
   - Instructions for manual verification

3. **test-disabled-parsing** / **export-disabled** - Verifies that parameters are NOT parsed when `parseLogParameters: false`

### Running the Test Workflow

**Via GitHub Actions UI:**
1. Go to the "Actions" tab
2. Select "Test Dynamic Span Parameters"
3. Click "Run workflow"
4. Select branch and run

**Via Push:**
```bash
git push origin your-branch
```

The test workflow runs automatically on:
- Pushes to `main`
- Pull requests
- Manual workflow dispatch

### Verifying Test Results

After the workflow runs:

1. Navigate to the workflow run
2. Open the "export-and-validate" job
3. Check the "Export trace with log parsing enabled" step
4. Look for console output showing spans with attributes
5. Verify that custom parameters appear in the span attributes

**Expected Output Pattern:**
```
{
  attributes: {
    'github.job.step.name': 'Build with metrics',
    'build.duration': '2s',
    'build.status': 'success',
    'build.size': '1.2MB',
    ...
  }
}
```

## Unit Testing

The log parser has comprehensive unit tests:

```bash
npm test src/logParser.test.ts
```

**Test Coverage:**
- ✅ Parsing span-parameter tags
- ✅ Parsing step-parameter tags
- ✅ Parsing job-parameter tags
- ✅ Parsing workflow-parameter tags
- ✅ Multiple parameters in same step
- ✅ Empty values
- ✅ Special characters in values
- ✅ Duplicate keys (last value wins)
- ✅ Multi-step log parsing
- ✅ Job logs with mixed parameter scopes

## Manual Testing

### Local Testing with Real Workflows

1. **Fork this repository** to your GitHub account

2. **Create a test workflow** in `.github/workflows/`:

```yaml
name: Manual Test
on: workflow_dispatch

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Test parameters
        run: |
          echo "<span-parameter key=\"test.metric\" value=\"123\"/>"
          echo "<job-parameter key=\"job.info\" value=\"test-job\"/>"
          echo "<workflow-parameter key=\"version\" value=\"1.0.0\"/>"

  export:
    needs: [test]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: package.json
          cache: npm

      - run: npm ci
      - run: npm run build

      - uses: ./
        with:
          otlpEndpoint: "console"
          otlpHeaders: "test=true"
          githubToken: ${{ secrets.GITHUB_TOKEN }}
          parseLogParameters: "true"
        env:
          OTEL_CONSOLE_ONLY: "true"
```

3. **Run the workflow** manually

4. **Check the logs** in the export job to verify parameters appear

### Local Development Testing

When developing the feature locally:

```bash
# Run unit tests
npm test

# Run specific test file
npm test src/logParser.test.ts

# Run with coverage
npm run test:ci

# Build and check for errors
npm run build
```

## Validation Script

A Node.js validation script is available for advanced testing:

```bash
# After downloading workflow logs to a file
node scripts/validate-trace.js workflow-logs.txt
```

The script validates that expected parameters appear in the trace output.

## Test Scenarios

### ✅ Positive Tests

| Scenario | Expected Result |
|----------|----------------|
| Print step parameter | Appears in step span attributes |
| Print job parameter | Appears in parent job span attributes |
| Print workflow parameter | Appears in root workflow span attributes |
| Multiple parameters in one step | All appear in respective spans |
| Parameters with special characters | Properly escaped and stored |
| Empty parameter values | Stored as empty strings |

### ✅ Negative Tests

| Scenario | Expected Result |
|----------|----------------|
| `parseLogParameters: false` | Parameters NOT parsed |
| Malformed tags | Silently ignored |
| No log access permissions | Graceful failure, continues without parameters |
| Job log fetch fails | Warning logged, trace still generated |

## Debugging

### Enable Debug Logging

The log parser uses `@actions/core` debug logging:

```yaml
- uses: ./
  with:
    otlpEndpoint: "console"
    otlpHeaders: "test=true"
    githubToken: ${{ secrets.GITHUB_TOKEN }}
  env:
    OTEL_CONSOLE_ONLY: "true"
    ACTIONS_STEP_DEBUG: "true"  # Enable debug logs
```

Debug logs show:
- Number of parameters parsed per step
- Step number mapping
- Parameter extraction details

### Common Issues

**Parameters not appearing:**
- Check that `parseLogParameters` is not set to `false`
- Verify the tag syntax is correct (self-closing XML tags)
- Ensure the step completed successfully
- Check that GitHub token has logs access permission

**Job logs not fetched:**
- Private repos require `githubToken` with actions read permission
- Check the runner logs for API errors
- Verify the workflow has the correct permissions

## CI/CD Integration

The test workflow runs on every PR to ensure:
- Feature remains functional
- No regressions in log parsing
- Backward compatibility maintained
- Both enabled and disabled modes work correctly

## Performance Testing

For large workflows with many parameters:

1. Monitor the "Get job logs" step duration
2. Check memory usage during log parsing
3. Verify trace export completes within timeout

The feature is designed to handle:
- Hundreds of parameters per workflow
- Large log files (several MB)
- Multiple concurrent jobs

## Contributing Tests

When adding new features:

1. Add unit tests to `src/logParser.test.ts`
2. Update the test workflow if needed
3. Ensure all tests pass: `npm test`
4. Verify the GitHub Actions workflow succeeds
