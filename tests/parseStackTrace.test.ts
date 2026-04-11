import { describe, it, expect } from "vitest";
import { parseStackTrace } from "../src/index.js";

const PATTERN = /([^(\s]+\.js):(\d+):(\d+)/g;

describe("parseStackTrace", () => {
  it("parses a standard Chrome-style stack trace", () => {
    const stack = `Error: fail
    at l (http://localhost:3000/dist/bundle.js:1:42)
    at Object.<anonymous> (http://localhost:3000/dist/bundle.js:1:78)`;

    const frames = parseStackTrace(stack, /(\/dist\/[^:]+\.js):(\d+):(\d+)/g);

    expect(frames).toHaveLength(2);
    expect(frames[0]!.file).toBe("/dist/bundle.js");
    expect(frames[0]!.line).toBe(1);
    expect(frames[0]!.column).toBe(42);
    expect(frames[0]!.functionName).toBe("l");
  });

  it("extracts functionName from 'at FnName (...)'", () => {
    const stack = `Error: oops
    at myFunction (/build/app.js:10:5)`;

    const frames = parseStackTrace(stack, /(\/build\/[^:]+\.js):(\d+):(\d+)/g);

    expect(frames).toHaveLength(1);
    expect(frames[0]!.functionName).toBe("myFunction");
  });

  it("skips lines that don't match the pattern", () => {
    const stack = `Error: fail
    at someNativeCode (<anonymous>:1:1)
    at handler (/dist/app.js:5:10)
    at process.emit (node:events:1:2)`;

    const frames = parseStackTrace(stack, /(\/dist\/[^:]+\.js):(\d+):(\d+)/g);

    expect(frames).toHaveLength(1);
    expect(frames[0]!.file).toBe("/dist/app.js");
  });

  it("returns an empty array for a stack with no matches", () => {
    const frames = parseStackTrace("Error: nothing here", PATTERN);
    expect(frames).toEqual([]);
  });

  it("returns an empty array for an empty string", () => {
    const frames = parseStackTrace("", PATTERN);
    expect(frames).toEqual([]);
  });
});
