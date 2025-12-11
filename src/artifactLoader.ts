import * as fs from "node:fs";
import * as path from "node:path";
import * as artifact from "@actions/artifact";
import * as core from "@actions/core";
import type { getOctokit } from "@actions/github";
import AdmZip from "adm-zip";

type OctokitClient = ReturnType<typeof getOctokit>;

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
  workflowRunId?: number,
  octokit?: OctokitClient,
  owner?: string,
  repo?: string,
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

    // For workflow_run events, use GitHub API to download artifacts
    if (workflowRunId && octokit && owner && repo) {
      core.info(`Looking for artifact from workflow run ${workflowRunId} using GitHub API`);
      return await loadSpanParametersViaGitHubAPI(artifactName, workflowRunId, octokit, owner, repo);
    }

    // If not found locally and no workflow run context, try the artifact action API
    // (this path is less reliable and requires ACTIONS_RUNTIME_TOKEN)
    core.info("Attempting to use @actions/artifact API (may not work in workflow_run context)");
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
 * Downloads span parameters artifact using GitHub API.
 * This is used for workflow_run events where we need to download artifacts
 * from a different workflow run.
 */
async function loadSpanParametersViaGitHubAPI(
  artifactName: string,
  workflowRunId: number,
  octokit: OctokitClient,
  owner: string,
  repo: string,
): Promise<SpanParameters | null> {
  try {
    // List artifacts for the workflow run
    core.info(`Fetching artifacts for workflow run ${workflowRunId}`);
    const { data: artifactsResponse } = await octokit.rest.actions.listWorkflowRunArtifacts({
      owner,
      repo,
      run_id: workflowRunId,
    });

    // Find the artifact by name
    const targetArtifact = artifactsResponse.artifacts.find((a) => a.name === artifactName);

    if (!targetArtifact) {
      core.info(`Artifact '${artifactName}' not found in workflow run ${workflowRunId}`);
      return null;
    }

    core.info(`Found artifact: ${targetArtifact.name} (ID: ${targetArtifact.id})`);

    // Download the artifact
    const { data: downloadData } = await octokit.rest.actions.downloadArtifact({
      owner,
      repo,
      artifact_id: targetArtifact.id,
      archive_format: "zip",
    });

    // The response is a zip file as ArrayBuffer
    const zip = new AdmZip(Buffer.from(downloadData as ArrayBuffer));
    const zipEntries = zip.getEntries();

    // Find params.json in the zip
    const paramsEntry = zipEntries.find((entry: AdmZip.IZipEntry) => entry.entryName === PARAMS_FILE_NAME);

    if (!paramsEntry) {
      core.warning(`${PARAMS_FILE_NAME} not found in artifact zip`);
      return null;
    }

    // Extract and parse the params file
    const content = paramsEntry.getData().toString("utf-8");
    const params = JSON.parse(content) as SpanParameters;

    core.info("Loaded span parameters from GitHub API artifact download");
    core.debug(`Span parameters: ${JSON.stringify(params)}`);

    return params;
  } catch (error) {
    if (error instanceof Error) {
      core.warning(`Failed to download artifact via GitHub API: ${error.message}`);
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
