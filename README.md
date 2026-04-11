# sourcemap-decoder

Decode production stack traces to original source locations using local `.map` files. One function call: raw `Error.stack` in, readable stack trace out.

No Sentry, no external services — sourcemaps stay on your server.

## Why this package?

`@jridgewell/trace-mapping` is a low-level primitive: give it a parsed sourcemap and a `line:column` position, it returns the original position. That's it.

To actually decode a production error, you still need to:

1. **Parse `Error.stack`** — extract file paths, line numbers, column numbers from a raw string
2. **Read `.map` files from disk** — resolve which sourcemap corresponds to which bundle
3. **Handle single-line bundles** — Webpack/esbuild can produce bundles where the sourcemap maps everything to line 1, but the runtime wraps code into multiple lines. You need to recalculate the absolute column offset
4. **Format the result** — turn decoded positions back into a readable stack trace

That's ~100 lines of non-trivial boilerplate every time. `sourcemap-decoder` does all of it in a single call.

### What about the alternatives?

| Package | Downloads | Status | Limitation |
|---------|----------|--------|------------|
| `source-map-support` | ~100M/week | Unmaintained (4+ years) | Runtime hook only — must be installed before errors are thrown. Cannot decode an arbitrary stack string after the fact |
| `--enable-source-maps` | Built-in | Experimental | Runtime only. Known performance issues with large bundles. Incompatible with custom `prepareStackTrace` |
| `stacktrace-js` | ~4.7M/week | Unmaintained (6+ years) | Browser-only — fetches sourcemaps via XHR |
| `sourcemapped-stacktrace` | ~135K/week | Inactive | Browser-only — no Node.js disk-based resolution |

**`sourcemap-decoder` fills the gap:** post-hoc decoding of collected stack traces on the server, using `.map` files from disk. Framework-agnostic, maintained, zero config beyond two required parameters.

## Install

```bash
npm install sourcemap-decoder
```

## Usage

```ts
import path from "path";
import { decodeStackTrace } from "sourcemap-decoder";

const result = decodeStackTrace(error.stack ?? "", {
  // Regex to match bundle paths in stack traces (must have `g` flag, 3 capture groups: file, line, column)
  stackPattern: /(\/dist\/[^:]+\.js):(\d+):(\d+)/g,

  // Resolve stack trace path to .map file on disk
  resolveSourceMap: (file) =>
    path.join("dist", file.replace(/^\/dist\//, "")) + ".map",
});

if (result.decoded) {
  console.error(result.stack);   // formatted, human-readable stack trace
  console.log(result.frames);    // individual decoded frames
}
```

### Next.js

```ts
const result = decodeStackTrace(error.stack ?? "", {
  stackPattern: /(\/_next\/static\/chunks\/[^:]+\.js):(\d+):(\d+)/g,
  resolveSourceMap: (file) =>
    path.join(".next/static/chunks", file.replace(/^\/_next\/static\/chunks\//, "")) + ".map",
});
```

### Webpack

```ts
const result = decodeStackTrace(error.stack ?? "", {
  stackPattern: /(\/dist\/[^:]+\.js):(\d+):(\d+)/g,
  resolveSourceMap: (file) =>
    path.join("dist", file.replace(/^\/dist\//, "")) + ".map",
});
```

### Custom clean path pattern

By default, `webpack://` prefixes are stripped from source paths. You can customize this:

```ts
const result = decodeStackTrace(stack, {
  stackPattern: /(\/build\/[^:]+\.js):(\d+):(\d+)/g,
  resolveSourceMap: (file) => path.join("build", file.replace(/^\/build\//, "")) + ".map",
  cleanPathPattern: /^webpack:\/\/my-app\//,
});
```

To disable path cleaning:

```ts
const result = decodeStackTrace(stack, {
  stackPattern: /..../g,
  resolveSourceMap: (file) => "...",
  cleanPaths: false,
});
```

## How it works

1. Parses bundle file references from the stack trace using your `stackPattern`
2. Resolves each reference to a `.map` file on disk via `resolveSourceMap`
3. Maps minified positions to original source using `@jridgewell/trace-mapping`

### Single-line bundle handling

Some bundlers produce output where the sourcemap has a single mapping line, but the runtime wraps the content into multiple lines. The runtime reports `line:3 col:42`, but the sourcemap only has mappings for `line:1`.

This library detects this case and recalculates the absolute column offset by summing line lengths, giving you the correct original position.

## API

### `decodeStackTrace(stack, options)`

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `stack` | `string` | Yes | Raw stack trace from `Error.stack` |
| `options.stackPattern` | `RegExp` | Yes | Regex with `g` flag matching `(file):(line):(column)` in stack traces |
| `options.resolveSourceMap` | `(file: string) => string` | Yes | Maps stack trace file path to `.map` file path on disk |
| `options.cleanPaths` | `boolean` | No | Strip prefixes from source paths. Default: `true` |
| `options.cleanPathPattern` | `RegExp` | No | Regex for path cleaning. Default: `/^webpack:\/\/\w+\//` |

**Returns:** `DecodeResult`

### `parseStackTrace(stack, pattern)`

Lower-level: parses a raw stack string into structured `StackFrame[]` without decoding.

### `decodeFrame(frame, resolveSourceMap, cleanPaths, cleanPathPattern)`

Lower-level: decodes a single `StackFrame` into a `DecodedFrame`.

### Types

```ts
interface DecodeResult {
  decoded: boolean;        // true if any frame was decoded
  stack: string;           // formatted stack trace
  frames?: DecodedFrame[]; // individual frames (when decoded=true)
}

interface DecodedFrame {
  file?: string;           // original source path
  line?: number;           // original line
  column?: number;         // original column
  function?: string;       // function name
  originalFile?: string;   // minified file
  originalLine?: number;   // minified line
  originalColumn?: number; // minified column
  error?: string;          // decode error (if failed)
}

interface StackFrame {
  file: string;
  line: number;
  column: number;
  functionName?: string;
}
```

## Related

- [sourcemap-decode-service](https://github.com/amadevstudio/source_dese) — standalone microservice with the same decoding logic and a REST API. Use it when you need an HTTP endpoint instead of a library import.

## Requirements

- Node.js >= 18
- Server-side only (reads files from disk)
- `.map` files must be present in your build output

## License

MIT
