#!/usr/bin/env node
import { decodeStackTrace } from "./index.js";

function parseArgs(args: string[]): { assetsPath?: string } {
  const idx = args.indexOf("--assets");
  if (idx !== -1 && args[idx + 1]) {
    return { assetsPath: args[idx + 1] };
  }
  return {};
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage: <command> 2>&1 | sourcemap-decode --assets <path>

Options:
  --assets <path>  Path to directory with .js and .js.map files
  --help, -h       Show this help message`);
    process.exit(0);
  }

  const { assetsPath } = parseArgs(args);
  if (!assetsPath) {
    console.error("Error: --assets <path> is required");
    process.exit(1);
  }

  const input = await readStdin();
  if (!input.trim()) {
    console.error("Error: no input received on stdin");
    process.exit(1);
  }

  const result = decodeStackTrace(input, { assetsPath });

  if (result.decoded) {
    console.log(result.stack);
  } else {
    console.log(input);
  }
}

main();
