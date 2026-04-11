import fs from "fs";
import path from "path";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";

export interface StackFrame {
  file: string;
  line: number;
  column: number;
  functionName?: string;
}

export interface DecodedFrame {
  file?: string;
  line?: number;
  column?: number;
  function?: string;
  originalFile?: string;
  originalLine?: number;
  originalColumn?: number;
  error?: string;
}

export interface DecodeResult {
  /** Whether at least one frame was successfully decoded */
  decoded: boolean;
  /** Formatted stack trace string (decoded or original) */
  stack: string;
  /** Individual decoded frames (only present when decoded=true) */
  frames?: DecodedFrame[];
}

export interface DecodeOptions {
  /**
   * Path to the directory containing `.js` and `.js.map` files.
   * The library will automatically find sourcemaps by matching basenames.
   *
   * This is the simplest way to use the library — just point it at your build output.
   *
   * @example
   * { assetsPath: "./dist" }
   * { assetsPath: ".next/static/chunks" }
   */
  assetsPath?: string;

  /**
   * Custom regex to match bundle references in stack traces.
   * Must capture 3 groups: (file):(line):(column).
   * Must have the `g` flag.
   *
   * Only needed for non-standard stack trace formats.
   * When omitted, a generic pattern matching any `.js:line:col` is used.
   */
  stackPattern?: RegExp;

  /**
   * Custom function to resolve a file path from a stack trace
   * to the corresponding `.map` file on disk.
   *
   * Only needed when your sourcemap file structure is non-standard.
   * When omitted (and `assetsPath` is set), basename matching is used.
   */
  resolveSourceMap?: (file: string) => string;

  /**
   * Clean sourcemap source paths (e.g. remove webpack:// prefixes).
   * Defaults to true.
   */
  cleanPaths?: boolean;

  /**
   * Regex to clean source paths. Applied when `cleanPaths` is true.
   * Defaults to `/^webpack:\/\/\w+\//` (removes webpack:// prefixes).
   */
  cleanPathPattern?: RegExp;
}

const DEFAULT_STACK_PATTERN = /([^\s()"']+\.js):(\d+):(\d+)/g;
const DEFAULT_CLEAN_PATH_PATTERN = /^webpack:\/\/\w+\//;
const FUNCTION_RE = /at\s+([^\s(]+)/;

/**
 * Recursively find a `.map` file by basename within a directory.
 * Returns the first match, or a fallback path in the root dir.
 */
function findMapFile(dir: string, basename: string): string {
  const rootCandidate = path.join(dir, basename);
  if (fs.existsSync(rootCandidate)) return rootCandidate;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const found = findMapFile(path.join(dir, entry.name), basename);
        if (fs.existsSync(found)) return found;
      }
    }
  } catch {
    // Permission errors, etc. — fall through
  }

  return rootCandidate; // fallback: let decodeFrame report "not found"
}

export function parseStackTrace(stack: string, pattern: RegExp): StackFrame[] {
  const frames: StackFrame[] = [];
  const lines = stack.split("\n");

  for (const line of lines) {
    pattern.lastIndex = 0;
    const match = pattern.exec(line);
    if (match?.[1] && match[2] && match[3]) {
      const frame: StackFrame = {
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
      };
      const fnMatch = line.match(FUNCTION_RE);
      if (fnMatch?.[1]) frame.functionName = fnMatch[1];
      frames.push(frame);
    }
  }

  return frames;
}

export function decodeFrame(
  frame: StackFrame,
  resolveSourceMap: (file: string) => string,
  cleanPaths: boolean,
  cleanPathPattern: RegExp
): DecodedFrame {
  const mapPath = resolveSourceMap(frame.file);
  const jsPath = mapPath.replace(/\.map$/, "");

  const base: DecodedFrame = {
    originalFile: frame.file,
    originalLine: frame.line,
    originalColumn: frame.column,
    ...(frame.functionName ? { function: frame.functionName } : {}),
  };

  try {
    if (!fs.existsSync(mapPath)) {
      return { ...base, error: `Sourcemap not found: ${mapPath}` };
    }

    const mapContent = fs.readFileSync(mapPath, "utf-8");
    const mapJson = JSON.parse(mapContent);
    const traceMap = new TraceMap(mapJson);

    const mappingLines = mapJson.mappings
      ? mapJson.mappings.split(";").length
      : 0;
    let pos;

    if (mappingLines === 1 && fs.existsSync(jsPath)) {
      // Single-line sourcemap: browser/runtime shows multi-line but map is line 1 only.
      // Recalculate absolute column from reported line:col.
      const data = fs.readFileSync(jsPath, "utf-8");
      const lines = data.split("\n");
      let absCol = 0;
      for (let i = 0; i < frame.line - 1 && i < lines.length; i++) {
        absCol += (lines[i]?.length ?? 0) + 1;
      }
      absCol += frame.column - 1;
      pos = originalPositionFor(traceMap, {
        line: 1,
        column: Math.max(absCol, 0),
      });
    } else {
      pos = originalPositionFor(traceMap, {
        line: frame.line,
        column: Math.max(frame.column - 1, 0),
      });
    }

    if (!pos?.source) {
      return { ...base, error: "No mapping found" };
    }

    const source = cleanPaths
      ? pos.source.replace(cleanPathPattern, "")
      : pos.source;

    return {
      file: source,
      line: pos.line ?? undefined,
      column: pos.column ?? undefined,
      function: pos.name ?? frame.functionName,
      originalFile: frame.file,
      originalLine: frame.line,
      originalColumn: frame.column,
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Decode a production stack trace to original source locations using sourcemaps.
 *
 * Reads `.map` files from disk. Must be called server-side (Node.js).
 *
 * @example
 * ```ts
 * import { decodeStackTrace } from "sourcemap-decoder";
 *
 * // Simple — just point at your build output folder:
 * const result = decodeStackTrace(error.stack ?? "", {
 *   assetsPath: "./dist",
 * });
 *
 * console.error(result.stack);
 * ```
 */
export function decodeStackTrace(
  stack: string,
  options: DecodeOptions = {}
): DecodeResult {
  const { assetsPath, cleanPaths = true } = options;
  const cleanPathPattern = options.cleanPathPattern ?? DEFAULT_CLEAN_PATH_PATTERN;

  const stackPattern = options.stackPattern ?? DEFAULT_STACK_PATTERN;

  let resolveSourceMap: (file: string) => string;
  if (options.resolveSourceMap) {
    resolveSourceMap = options.resolveSourceMap;
  } else if (assetsPath) {
    resolveSourceMap = (file) =>
      findMapFile(assetsPath, path.basename(file) + ".map");
  } else {
    // No assetsPath and no resolveSourceMap — try .map next to the file itself
    resolveSourceMap = (file) => file + ".map";
  }

  const parsed = parseStackTrace(stack, stackPattern);
  if (parsed.length === 0) return { decoded: false, stack };

  const frames = parsed.map((f) =>
    decodeFrame(f, resolveSourceMap, cleanPaths, cleanPathPattern)
  );

  const hasDecoded = frames.some((f) => f.file && !f.error);
  if (!hasDecoded) return { decoded: false, stack };

  const formatted = frames
    .map((f) => {
      const fn = f.function ?? "anonymous";
      const file = f.file ?? f.originalFile ?? "unknown";
      const line = f.line ?? f.originalLine ?? "?";
      const col = f.column ?? f.originalColumn ?? "?";
      return `    at ${fn} (${file}:${line}:${col})`;
    })
    .join("\n");

  return { decoded: true, stack: formatted, frames };
}
