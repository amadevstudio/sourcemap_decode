import { describe, it, expect } from "vitest";
import path from "path";
import { decodeFrame } from "../src/index.js";

const fixturesDir = path.resolve("tests/fixtures");
const resolve = (file: string) => path.join(fixturesDir, file) + ".map";
const cleanPattern = /^webpack:\/\/\w+\//;

describe("decodeFrame", () => {
  it("decodes a frame from a single-line bundle", () => {
    const result = decodeFrame(
      { file: "test-bundle.js", line: 1, column: 1 },
      resolve,
      true,
      cleanPattern
    );

    expect(result.error).toBeUndefined();
    expect(result.file).toContain("_original.ts");
    expect(result.line).toBeTypeOf("number");
    expect(result.originalFile).toBe("test-bundle.js");
  });

  it("decodes the greet function position (line 1)", () => {
    const result = decodeFrame(
      { file: "test-bundle.js", line: 1, column: 1, functionName: "o" },
      resolve,
      true,
      cleanPattern
    );

    expect(result.error).toBeUndefined();
    expect(result.file).toContain("_original.ts");
    expect(result.line).toBe(1);
  });

  it("decodes the fail function position (line 5)", () => {
    const result = decodeFrame(
      { file: "test-bundle.js", line: 1, column: 35, functionName: "l" },
      resolve,
      true,
      cleanPattern
    );

    expect(result.error).toBeUndefined();
    expect(result.file).toContain("_original.ts");
    expect(result.line).toBe(5);
  });

  it("handles single-line sourcemap with multi-line runtime display", () => {
    const result = decodeFrame(
      { file: "multiline-display.js", line: 2, column: 1, functionName: "l" },
      resolve,
      true,
      cleanPattern
    );

    expect(result.error).toBeUndefined();
    expect(result.file).toContain("_original.ts");
  });

  it("returns error for missing sourcemap", () => {
    const result = decodeFrame(
      { file: "nonexistent.js", line: 1, column: 1 },
      resolve,
      true,
      cleanPattern
    );

    expect(result.error).toContain("Sourcemap not found");
  });

  it("preserves original frame metadata", () => {
    const result = decodeFrame(
      { file: "test-bundle.js", line: 1, column: 1, functionName: "myFunc" },
      resolve,
      true,
      cleanPattern
    );

    expect(result.originalFile).toBe("test-bundle.js");
    expect(result.originalLine).toBe(1);
    expect(result.originalColumn).toBe(1);
  });
});
