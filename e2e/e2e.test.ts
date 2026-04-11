import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { decodeStackTrace } from "../src/index.js";

const e2eDir = path.resolve("e2e");
const distDir = path.join(e2eDir, "dist");
const bundlePath = path.join(distDir, "app.js");

beforeAll(() => {
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }

  execSync(
    `npx esbuild e2e/src/app.ts --bundle --outfile=e2e/dist/app.js --sourcemap --minify --platform=node --format=esm`,
    { cwd: path.resolve("."), stdio: "pipe" }
  );
});

function captureStackTrace(): string {
  const output = execSync(`node e2e/dist/app.js 2>&1`, {
    cwd: path.resolve("."),
    encoding: "utf-8",
  });
  const stackMatch = output.match(/(TypeError:[\s\S]+)/);
  expect(stackMatch).not.toBeNull();
  return stackMatch![1]!;
}

describe("e2e: real bundled app", () => {
  it("bundle and sourcemap exist", () => {
    expect(fs.existsSync(bundlePath)).toBe(true);
    expect(fs.existsSync(bundlePath + ".map")).toBe(true);
  });

  it("decodes with simple assetsPath", () => {
    const rawStack = captureStackTrace();

    console.log("=== Raw stack trace ===");
    console.log(rawStack);

    const result = decodeStackTrace(rawStack, {
      assetsPath: distDir,
    });

    console.log("\n=== Decoded stack trace ===");
    console.log(result.stack);

    expect(result.decoded).toBe(true);
    expect(result.frames).toBeDefined();
    expect(result.frames!.length).toBeGreaterThan(0);

    const firstFrame = result.frames![0]!;
    expect(firstFrame.file).toContain("utils.ts");
    expect(firstFrame.line).toBe(10);

    const appFrame = result.frames!.find((f) => f.file?.includes("app.ts"));
    expect(appFrame).toBeDefined();
    expect(appFrame!.line).toBe(8);
  });

  it("decodes with custom stackPattern + resolveSourceMap", () => {
    const rawStack = captureStackTrace();

    const result = decodeStackTrace(rawStack, {
      stackPattern: /(app\.js):(\d+):(\d+)/g,
      resolveSourceMap: () => bundlePath + ".map",
    });

    expect(result.decoded).toBe(true);
    expect(result.frames![0]!.file).toContain("utils.ts");
  });
});
