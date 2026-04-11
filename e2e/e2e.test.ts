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

describe("e2e: real bundled app", () => {
  it("bundle and sourcemap exist", () => {
    expect(fs.existsSync(bundlePath)).toBe(true);
    expect(fs.existsSync(bundlePath + ".map")).toBe(true);
  });

  it("decodes a real minified stack trace from bundled code", () => {
    // Run the bundled app — it catches the error internally and console.error's the stack
    const output = execSync(`node e2e/dist/app.js 2>&1`, {
      cwd: path.resolve("."),
      encoding: "utf-8",
    });

    // Extract the stack trace
    const stackMatch = output.match(/(TypeError:[\s\S]+)/);
    expect(stackMatch).not.toBeNull();
    const rawStack = stackMatch![1]!;

    console.log("=== Raw stack trace ===");
    console.log(rawStack);

    // The stack trace contains file:// URLs like:
    //   at o (file:///abs/path/e2e/dist/app.js:1:126)
    // We need to match the app.js part
    const result = decodeStackTrace(rawStack, {
      stackPattern: /(app\.js):(\d+):(\d+)/g,
      resolveSourceMap: () => bundlePath + ".map",
    });

    console.log("\n=== Decoded stack trace ===");
    console.log(result.stack);
    console.log("\n=== Frames ===");
    console.log(JSON.stringify(result.frames, null, 2));

    expect(result.decoded).toBe(true);
    expect(result.frames).toBeDefined();
    expect(result.frames!.length).toBeGreaterThan(0);

    // First frame should point to validateEmail in utils.ts (the throw)
    const firstFrame = result.frames![0]!;
    expect(firstFrame.file).toContain("utils.ts");
    expect(firstFrame.line).toBe(10); // throw new TypeError line in original utils.ts

    // Second frame should point to initApp in app.ts
    const appFrame = result.frames!.find((f) => f.file?.includes("app.ts"));
    expect(appFrame).toBeDefined();
    expect(appFrame!.line).toBe(8); // validateEmail("not-an-email") call in original app.ts
  });
});
