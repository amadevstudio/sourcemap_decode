import { describe, it, expect } from "vitest";
import path from "path";
import { decodeStackTrace } from "../src/index.js";

const fixturesDir = path.resolve("tests/fixtures");

const options = {
  stackPattern: /([^\s(:]+\.js):(\d+):(\d+)/g,
  resolveSourceMap: (file: string) => path.join(fixturesDir, file) + ".map",
};

describe("decodeStackTrace", () => {
  it("decodes a full stack trace end-to-end", () => {
    const stack = `Error: fail
    at l (test-bundle.js:1:35)
    at Object.<anonymous> (test-bundle.js:1:75)`;

    const result = decodeStackTrace(stack, options);

    expect(result.decoded).toBe(true);
    expect(result.stack).toContain("_original.ts");
    expect(result.frames).toBeDefined();
    expect(result.frames!.length).toBeGreaterThan(0);
    expect(result.frames![0]!.file).toContain("_original.ts");
  });

  it("returns decoded=false for a stack with no matching frames", () => {
    const result = decodeStackTrace("Error: nothing here\n    at foo (bar:1:1)", options);

    expect(result.decoded).toBe(false);
  });

  it("returns decoded=false for an empty string", () => {
    const result = decodeStackTrace("", options);

    expect(result.decoded).toBe(false);
  });

  it("formats stack trace with 'at fn (file:line:col)' format", () => {
    const stack = `Error: fail
    at l (test-bundle.js:1:35)`;

    const result = decodeStackTrace(stack, options);

    expect(result.decoded).toBe(true);
    expect(result.stack).toMatch(/^\s+at \S+ \(.+:\d+:\d+\)$/m);
  });

  it("preserves original stack when no frames can be decoded", () => {
    const stack = "Error: fail\n    at unknown (missing.js:1:1)";
    const result = decodeStackTrace(stack, options);

    // missing.js matches regex but .map doesn't exist => all frames have errors => decoded=false
    expect(result.decoded).toBe(false);
    expect(result.stack).toBe(stack);
  });
});
