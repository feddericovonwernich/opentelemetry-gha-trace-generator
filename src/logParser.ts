import * as core from "@actions/core";

export interface ParsedStepLogs {
  stepParameters: Record<string, string>;
  jobParameters: Record<string, string>;
  workflowParameters: Record<string, string>;
}

// Regex patterns for each tag type
const SPAN_PARAM_REGEX = /<span-parameter\s+key="([^"]+)"\s+value="([^"]*)"\s*\/>/g;
const STEP_PARAM_REGEX = /<step-parameter\s+key="([^"]+)"\s+value="([^"]*)"\s*\/>/g;
const JOB_PARAM_REGEX = /<job-parameter\s+key="([^"]+)"\s+value="([^"]*)"\s*\/>/g;
const WORKFLOW_PARAM_REGEX = /<workflow-parameter\s+key="([^"]+)"\s+value="([^"]*)"\s*\/>/g;

export function parseStepLogs(logs: string): ParsedStepLogs {
  const result: ParsedStepLogs = {
    stepParameters: {},
    jobParameters: {},
    workflowParameters: {},
  };

  // Parse step parameters (default + explicit)
  for (const match of logs.matchAll(SPAN_PARAM_REGEX)) {
    result.stepParameters[match[1]] = match[2];
  }
  for (const match of logs.matchAll(STEP_PARAM_REGEX)) {
    result.stepParameters[match[1]] = match[2];
  }

  // Parse job parameters
  for (const match of logs.matchAll(JOB_PARAM_REGEX)) {
    result.jobParameters[match[1]] = match[2];
  }

  // Parse workflow parameters
  for (const match of logs.matchAll(WORKFLOW_PARAM_REGEX)) {
    result.workflowParameters[match[1]] = match[2];
  }

  return result;
}

interface Step {
  name: string;
  number: number;
}

export function parseJobLogs(jobLog: string, steps: Step[]): Map<number, ParsedStepLogs> {
  const stepLogs = new Map<number, ParsedStepLogs>();

  if (!jobLog || steps.length === 0) {
    return stepLogs;
  }

  // GitHub job logs have step markers
  // The format includes timestamps and step markers like:
  // "2024-01-01T00:00:00.0000000Z ##[group]Run actions/checkout@v4"

  // Split log into sections by step number
  // Each step section starts with a pattern containing the step number
  const lines = jobLog.split("\n");
  let currentStepNumber = -1;
  let currentStepLogs: string[] = [];

  for (const line of lines) {
    // Look for step start markers
    // GitHub format: timestamp ##[group]<step info>
    const stepMatch = line.match(/##\[group\]/);

    if (stepMatch) {
      // Save previous step logs if we have any
      if (currentStepNumber >= 0 && currentStepLogs.length > 0) {
        const stepLogText = currentStepLogs.join("\n");
        stepLogs.set(currentStepNumber, parseStepLogs(stepLogText));
        core.debug(
          `Parsed ${Object.keys(stepLogs.get(currentStepNumber)?.stepParameters || {}).length} step parameters for step ${currentStepNumber}`,
        );
      }

      // Find which step number this corresponds to
      // Increment step counter (steps are sequential)
      currentStepNumber++;
      currentStepLogs = [line];
    } else {
      currentStepLogs.push(line);
    }
  }

  // Save the last step's logs
  if (currentStepNumber >= 0 && currentStepLogs.length > 0) {
    const stepLogText = currentStepLogs.join("\n");
    stepLogs.set(currentStepNumber, parseStepLogs(stepLogText));
    core.debug(
      `Parsed ${Object.keys(stepLogs.get(currentStepNumber)?.stepParameters || {}).length} step parameters for step ${currentStepNumber}`,
    );
  }

  return stepLogs;
}
