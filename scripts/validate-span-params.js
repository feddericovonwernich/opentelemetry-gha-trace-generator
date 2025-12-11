#!/usr/bin/env node

/**
 * Validates that span parameters appear in the trace output
 * Usage: node validate-span-params.js <log-file> <expected-params.json>
 */

const fs = require("node:fs");

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Test validation script
function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage: validate-span-params.js <log-file> <expected-params.json>");
    process.exit(1);
  }

  const logFile = args[0];
  const expectedParamsFile = args[1];

  // Read the log output
  const logContent = fs.readFileSync(logFile, "utf-8");

  // Read expected parameters
  const expectedParams = JSON.parse(fs.readFileSync(expectedParamsFile, "utf-8"));

  console.log("Validating span parameters in trace output...\n");

  let allFound = true;
  const missingParams = [];

  // Check workflow-level parameters
  if (expectedParams.workflow) {
    console.log("Checking workflow-level parameters:");
    for (const [key, value] of Object.entries(expectedParams.workflow)) {
      // Look for the parameter in the log output
      // ConsoleSpanExporter outputs attributes in format: attributes: { 'key': 'value', ... }
      const regex = new RegExp(`['"]${escapeRegex(key)}['"]\\s*:\\s*['"]${escapeRegex(value)}['"]`);
      if (regex.test(logContent)) {
        console.log(`  ✓ ${key}: ${value}`);
      } else {
        console.log(`  ✗ ${key}: ${value} (NOT FOUND)`);
        allFound = false;
        missingParams.push({ level: "workflow", key, value });
      }
    }
  }

  // Check job-level parameters
  if (expectedParams.job) {
    console.log("\nChecking job-level parameters:");
    for (const [key, value] of Object.entries(expectedParams.job)) {
      const regex = new RegExp(`['"]${escapeRegex(key)}['"]\\s*:\\s*['"]${escapeRegex(value)}['"]`);
      if (regex.test(logContent)) {
        console.log(`  ✓ ${key}: ${value}`);
      } else {
        console.log(`  ✗ ${key}: ${value} (NOT FOUND)`);
        allFound = false;
        missingParams.push({ level: "job", key, value });
      }
    }
  }

  // Check step-level parameters
  if (expectedParams.steps) {
    console.log("\nChecking step-level parameters:");
    for (const [stepName, stepParams] of Object.entries(expectedParams.steps)) {
      console.log(`  Step: ${stepName}`);
      for (const [key, value] of Object.entries(stepParams)) {
        const regex = new RegExp(`['"]${escapeRegex(key)}['"]\\s*:\\s*['"]${escapeRegex(value)}['"]`);
        if (regex.test(logContent)) {
          console.log(`    ✓ ${key}: ${value}`);
        } else {
          console.log(`    ✗ ${key}: ${value} (NOT FOUND)`);
          allFound = false;
          missingParams.push({ level: "step", step: stepName, key, value });
        }
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);

  if (allFound) {
    console.log("✅ SUCCESS: All expected parameters found in trace output");
    process.exit(0);
  } else {
    console.log("❌ FAILURE: Some parameters were not found in trace output");
    console.log("\nMissing parameters:");
    for (const param of missingParams) {
      if (param.step) {
        console.log(`  - [${param.level}/${param.step}] ${param.key}: ${param.value}`);
      } else {
        console.log(`  - [${param.level}] ${param.key}: ${param.value}`);
      }
    }
    process.exit(1);
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main();
