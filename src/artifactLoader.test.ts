import { describe, expect, it } from "@jest/globals";
import { type SpanParameters, mergeSpanParameters } from "./artifactLoader";

describe("mergeSpanParameters", () => {
  it("should return empty structure when both inputs are null", () => {
    const result = mergeSpanParameters(null, null);
    expect(result).toEqual({
      workflow: {},
      job: {},
      steps: {},
    });
  });

  it("should return log params when artifact params are null", () => {
    const logParams: SpanParameters = {
      workflow: { version: "1.0.0" },
      job: { "job.test": "true" },
      steps: { step1: { "step.duration": "10s" } },
    };

    const result = mergeSpanParameters(null, logParams);
    expect(result).toEqual(logParams);
  });

  it("should return artifact params when log params are null", () => {
    const artifactParams: SpanParameters = {
      workflow: { version: "2.0.0" },
      job: { "job.build": "success" },
      steps: { step2: { "step.status": "ok" } },
    };

    const result = mergeSpanParameters(artifactParams, null);
    expect(result).toEqual(artifactParams);
  });

  it("should merge params with artifact params taking precedence", () => {
    const logParams: SpanParameters = {
      workflow: { version: "1.0.0", fromLog: "true" },
      job: { "job.test": "true" },
      steps: { step1: { "step.duration": "10s" } },
    };

    const artifactParams: SpanParameters = {
      workflow: { version: "2.0.0", fromArtifact: "true" },
      job: { "job.build": "success" },
      steps: { step1: { "step.extra": "value" }, step2: { "step.status": "ok" } },
    };

    const result = mergeSpanParameters(artifactParams, logParams);

    expect(result.workflow).toEqual({
      version: "2.0.0", // artifact wins
      fromLog: "true",
      fromArtifact: "true",
    });
    expect(result.job).toEqual({
      "job.test": "true",
      "job.build": "success",
    });
    expect(result.steps["step1"]).toEqual({
      "step.duration": "10s",
      "step.extra": "value",
    });
    expect(result.steps["step2"]).toEqual({
      "step.status": "ok",
    });
  });

  it("should override log params with artifact params for same keys", () => {
    const logParams: SpanParameters = {
      workflow: { status: "building" },
      job: {},
      steps: {},
    };

    const artifactParams: SpanParameters = {
      workflow: { status: "completed" },
      job: {},
      steps: {},
    };

    const result = mergeSpanParameters(artifactParams, logParams);
    expect(result.workflow["status"]).toBe("completed");
  });
});
