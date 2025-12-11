import * as fs from "node:fs";
import * as path from "node:path";
import * as artifact from "@actions/artifact";
import * as core from "@actions/core";

export interface SpanParameters {
  workflow: Record<string, string>;
  job: Record<string, string>;
  steps: Record<string, Record<string, string>>;
}

const DEFAULT_ARTIFACT_NAME = "otel-span-parameters";
const PARAMS_FILE_NAME = "params.json";

/**
 * Downloads the span parameters artifact and parses it.
 * Returns null if the artifact doesn't exist or can't be parsed.
 */
export async function loadSpanParametersFromArtifact(
  artifactName: string = DEFAULT_ARTIFACT_NAME,
): Promise<SpanParameters | null> {
  try {
    // First, check if params are available locally (from emit-params action in same workflow)
    // The emit-params action creates files in otel-span-params/ directory
    const localParamsPath = path.join(process.cwd(), "otel-span-params", PARAMS_FILE_NAME);
    if (fs.existsSync(localParamsPath)) {
      core.info("Found local span parameters file (same workflow run)");
      const content = fs.readFileSync(localParamsPath, "utf-8");
      const params = JSON.parse(content) as SpanParameters;
      core.info("Loaded span parameters from local file");
      core.debug(`Span parameters: ${JSON.stringify(params)}`);
      return params;
    }

    // If not found locally, try downloading from artifact (for workflow_run events)
    const client = artifact.default;

    // Create a temporary directory for the download
    const downloadPath = path.join(process.cwd(), ".otel-span-params-download");
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
    }

    core.info(`Looking for artifact: ${artifactName}`);

    // First, find the artifact by name to get its ID
    const getResponse = await client.getArtifact(artifactName);
    core.info(`Found artifact: ${getResponse.artifact.name} (ID: ${getResponse.artifact.id})`);

    // Download the artifact using its ID
    const response = await client.downloadArtifact(getResponse.artifact.id, {
      path: downloadPath,
    });

    core.info(`Downloaded artifact to: ${response.downloadPath}`);

    // Read and parse the params file
    const paramsFilePath = path.join(downloadPath, PARAMS_FILE_NAME);

    if (!fs.existsSync(paramsFilePath)) {
      core.warning(`Artifact downloaded but ${PARAMS_FILE_NAME} not found`);
      return null;
    }

    const content = fs.readFileSync(paramsFilePath, "utf-8");
    const params = JSON.parse(content) as SpanParameters;

    core.info("Loaded span parameters from artifact");
    core.debug(`Span parameters: ${JSON.stringify(params)}`);

    // Clean up the download directory
    fs.rmSync(downloadPath, { recursive: true, force: true });

    return params;
  } catch (error) {
    // Artifact may not exist, which is fine
    if (error instanceof Error) {
      if (error.message.includes("Unable to find") || error.message.includes("not found")) {
        core.info(`No span parameters artifact found (${artifactName})`);
      } else {
        core.warning(`Failed to load span parameters artifact: ${error.message}`);
      }
    }
    return null;
  }
}

/**
 * Merges artifact parameters with log-parsed parameters.
 * Artifact parameters take precedence over log-parsed parameters.
 */
export function mergeSpanParameters(
  artifactParams: SpanParameters | null,
  logParams: SpanParameters | null,
): SpanParameters {
  const merged: SpanParameters = {
    workflow: {},
    job: {},
    steps: {},
  };

  // First apply log params (lower priority)
  if (logParams) {
    merged.workflow = { ...logParams.workflow };
    merged.job = { ...logParams.job };
    for (const [stepName, stepParams] of Object.entries(logParams.steps)) {
      merged.steps[stepName] = { ...stepParams };
    }
  }

  // Then apply artifact params (higher priority, overrides log params)
  if (artifactParams) {
    merged.workflow = { ...merged.workflow, ...artifactParams.workflow };
    merged.job = { ...merged.job, ...artifactParams.job };
    for (const [stepName, stepParams] of Object.entries(artifactParams.steps)) {
      merged.steps[stepName] = { ...merged.steps[stepName], ...stepParams };
    }
  }

  return merged;
}
