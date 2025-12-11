#!/usr/bin/env node

/**
 * Validation script for dynamic span parameters in OpenTelemetry traces
 *
 * This script reads the GitHub Actions workflow run logs and validates that
 * dynamic parameters printed during workflow execution appear in the generated traces.
 */

const fs = require("node:fs");

function parseTraceOutput(logContent) {
  // Extract spans from the console output
  // ConsoleSpanExporter outputs JSON-like structures
  const spans = [];
  const lines = logContent.split("\n");

  for (const line of lines) {
    // Look for lines that contain span data
    if (line.includes("attributes:") || line.includes("name:")) {
      spans.push(line);
    }
  }

  return spans;
}

function validateDynamicParameters(logContent) {
  const results = {
    passed: [],
    failed: [],
    warnings: [],
  };

  // Expected parameters that should appear in the trace
  const expectedStepParams = [
    "build.duration",
    "build.status",
    "build.size",
    "test.total",
    "test.passed",
    "test.failed",
    "deploy.time",
  ];

  const expectedJobParams = ["job.test_type", "job.artifacts_count", "job.coverage"];

  const expectedWorkflowParams = [
    "workflow.test_run",
    "workflow.quality_gate",
    "deployment.version",
    "deployment.environment",
  ];

  // Check step-level parameters
  for (const param of expectedStepParams) {
    if (logContent.includes(`'${param}'`) || logContent.includes(`"${param}"`)) {
      results.passed.push(`✅ Step parameter found: ${param}`);
    } else {
      results.failed.push(`❌ Step parameter missing: ${param}`);
    }
  }

  // Check job-level parameters
  for (const param of expectedJobParams) {
    if (logContent.includes(`'${param}'`) || logContent.includes(`"${param}"`)) {
      results.passed.push(`✅ Job parameter found: ${param}`);
    } else {
      results.failed.push(`❌ Job parameter missing: ${param}`);
    }
  }

  // Check workflow-level parameters
  for (const param of expectedWorkflowParams) {
    if (logContent.includes(`'${param}'`) || logContent.includes(`"${param}"`)) {
      results.passed.push(`✅ Workflow parameter found: ${param}`);
    } else {
      results.failed.push(`❌ Workflow parameter missing: ${param}`);
    }
  }

  return results;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: node validate-trace.js <log-file>");
    console.log("");
    console.log("This script validates that dynamic span parameters appear in trace output.");
    console.log("Pass the path to a log file containing the trace export output.");
    process.exit(1);
  }

  const logFile = args[0];

  if (!fs.existsSync(logFile)) {
    console.error(`Error: File not found: ${logFile}`);
    process.exit(1);
  }

  const logContent = fs.readFileSync(logFile, "utf-8");

  console.log("🔍 Validating dynamic span parameters in trace output...\n");

  const results = validateDynamicParameters(logContent);

  // Print results
  if (results.passed.length > 0) {
    console.log("Passed checks:");
    for (const msg of results.passed) {
      console.log(`  ${msg}`);
    }
    console.log("");
  }

  if (results.warnings.length > 0) {
    console.log("Warnings:");
    for (const msg of results.warnings) {
      console.log(`  ${msg}`);
    }
    console.log("");
  }

  if (results.failed.length > 0) {
    console.log("Failed checks:");
    for (const msg of results.failed) {
      console.log(`  ${msg}`);
    }
    console.log("");
  }

  // Summary
  const total = results.passed.length + results.failed.length;
  console.log(`Summary: ${results.passed.length}/${total} checks passed`);

  if (results.failed.length > 0) {
    console.log("\n❌ Validation FAILED");
    process.exit(1);
  } else {
    console.log("\n✅ All validations PASSED");
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { validateDynamicParameters, parseTraceOutput };
