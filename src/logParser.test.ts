import { describe, expect, it } from "@jest/globals";
import { parseJobLogs, parseStepLogs } from "./logParser";

describe("parseStepLogs", () => {
  it("should parse span-parameter tags", () => {
    const logs = `
      Building application...
      <span-parameter key="build.duration" value="42s"/>
      Build complete!
    `;
    const result = parseStepLogs(logs);
    expect(result.stepParameters).toEqual({ "build.duration": "42s" });
    expect(result.jobParameters).toEqual({});
    expect(result.workflowParameters).toEqual({});
  });

  it("should parse step-parameter tags", () => {
    const logs = `<step-parameter key="test.count" value="100"/>`;
    const result = parseStepLogs(logs);
    expect(result.stepParameters).toEqual({ "test.count": "100" });
  });

  it("should parse job-parameter tags", () => {
    const logs = `<job-parameter key="job.total_tests" value="150"/>`;
    const result = parseStepLogs(logs);
    expect(result.jobParameters).toEqual({ "job.total_tests": "150" });
    expect(result.stepParameters).toEqual({});
  });

  it("should parse workflow-parameter tags", () => {
    const logs = `<workflow-parameter key="version" value="1.2.3"/>`;
    const result = parseStepLogs(logs);
    expect(result.workflowParameters).toEqual({ version: "1.2.3" });
    expect(result.stepParameters).toEqual({});
  });

  it("should handle multiple parameters", () => {
    const logs = `
      <span-parameter key="a" value="1"/>
      <span-parameter key="b" value="2"/>
      <job-parameter key="c" value="3"/>
      <workflow-parameter key="d" value="4"/>
    `;
    const result = parseStepLogs(logs);
    expect(result.stepParameters).toEqual({ a: "1", b: "2" });
    expect(result.jobParameters).toEqual({ c: "3" });
    expect(result.workflowParameters).toEqual({ d: "4" });
  });

  it("should handle empty values", () => {
    const logs = `<span-parameter key="empty" value=""/>`;
    const result = parseStepLogs(logs);
    expect(result.stepParameters).toEqual({ empty: "" });
  });

  it("should handle no parameters", () => {
    const logs = "Just regular log output";
    const result = parseStepLogs(logs);
    expect(result.stepParameters).toEqual({});
    expect(result.jobParameters).toEqual({});
    expect(result.workflowParameters).toEqual({});
  });

  it("should handle values with special characters", () => {
    const logs = `<span-parameter key="message" value="Build completed in 42.5s with 100% success!"/>`;
    const result = parseStepLogs(logs);
    expect(result.stepParameters).toEqual({ message: "Build completed in 42.5s with 100% success!" });
  });

  it("should handle duplicate keys with last value winning", () => {
    const logs = `
      <span-parameter key="count" value="1"/>
      <span-parameter key="count" value="2"/>
    `;
    const result = parseStepLogs(logs);
    expect(result.stepParameters).toEqual({ count: "2" });
  });

  it("should handle both span-parameter and step-parameter for same key", () => {
    const logs = `
      <span-parameter key="count" value="1"/>
      <step-parameter key="count" value="2"/>
    `;
    const result = parseStepLogs(logs);
    expect(result.stepParameters).toEqual({ count: "2" });
  });
});

describe("parseJobLogs", () => {
  it("should return empty map for empty logs", () => {
    const result = parseJobLogs("", []);
    expect(result.size).toBe(0);
  });

  it("should return empty map for logs with no steps", () => {
    const logs = "Some log output";
    const result = parseJobLogs(logs, []);
    expect(result.size).toBe(0);
  });

  it("should parse single step logs", () => {
    const logs = `
2024-01-01T00:00:00.0000000Z ##[group]Run actions/checkout@v4
2024-01-01T00:00:01.0000000Z Checking out repository
2024-01-01T00:00:02.0000000Z <span-parameter key="checkout.time" value="2s"/>
2024-01-01T00:00:03.0000000Z ##[endgroup]
`;
    const steps = [{ name: "Checkout", number: 1 }];
    const result = parseJobLogs(logs, steps);

    expect(result.size).toBe(1);
    expect(result.get(0)?.stepParameters).toEqual({ "checkout.time": "2s" });
  });

  it("should parse multiple step logs", () => {
    const logs = `
2024-01-01T00:00:00.0000000Z ##[group]Run actions/checkout@v4
2024-01-01T00:00:01.0000000Z <span-parameter key="step1.param" value="value1"/>
2024-01-01T00:00:02.0000000Z ##[endgroup]
2024-01-01T00:00:03.0000000Z ##[group]Run npm install
2024-01-01T00:00:04.0000000Z <span-parameter key="step2.param" value="value2"/>
2024-01-01T00:00:05.0000000Z ##[endgroup]
2024-01-01T00:00:06.0000000Z ##[group]Run npm test
2024-01-01T00:00:07.0000000Z <span-parameter key="step3.param" value="value3"/>
2024-01-01T00:00:08.0000000Z ##[endgroup]
`;
    const steps = [
      { name: "Checkout", number: 1 },
      { name: "Install", number: 2 },
      { name: "Test", number: 3 },
    ];
    const result = parseJobLogs(logs, steps);

    expect(result.size).toBe(3);
    expect(result.get(0)?.stepParameters).toEqual({ "step1.param": "value1" });
    expect(result.get(1)?.stepParameters).toEqual({ "step2.param": "value2" });
    expect(result.get(2)?.stepParameters).toEqual({ "step3.param": "value3" });
  });

  it("should handle job and workflow parameters in step logs", () => {
    const logs = `
2024-01-01T00:00:00.0000000Z ##[group]Run tests
2024-01-01T00:00:01.0000000Z <span-parameter key="step.param" value="step_value"/>
2024-01-01T00:00:02.0000000Z <job-parameter key="job.param" value="job_value"/>
2024-01-01T00:00:03.0000000Z <workflow-parameter key="workflow.param" value="workflow_value"/>
2024-01-01T00:00:04.0000000Z ##[endgroup]
`;
    const steps = [{ name: "Test", number: 1 }];
    const result = parseJobLogs(logs, steps);

    expect(result.size).toBe(1);
    const parsed = result.get(0);
    expect(parsed?.stepParameters).toEqual({ "step.param": "step_value" });
    expect(parsed?.jobParameters).toEqual({ "job.param": "job_value" });
    expect(parsed?.workflowParameters).toEqual({ "workflow.param": "workflow_value" });
  });
});
