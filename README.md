# sourcemap-decoder

Decode production stack traces to original source locations using local `.map` files. One function call: raw `Error.stack` in, readable stack trace out.

No Sentry, no external services — sourcemaps stay on your server.

## Why this package?

`@jridgewell/trace-mapping` is a great low-level primitive: give it a parsed sourcemap and a `line:column`, it returns the original position. But to actually decode a production error, you still need to:

1. **Parse `Error.stack`** — extract file paths, line numbers, column numbers from a raw string
2. **Read `.map` files from disk** — figure out which sourcemap corresponds to which bundle
3. **Handle single-line bundles** — Webpack/esbuild can produce single-line output, but the runtime wraps it into multiple lines. You need to recalculate the absolute column offset
4. **Format the result** — turn decoded positions back into a readable stack trace

That's ~100 lines of non-trivial boilerplate. `sourcemap-decoder` wraps all of it into one call.

### What about the alternatives?

| Package | Downloads | Status | Limitation |
|---------|----------|--------|------------|
| `source-map-support` | ~100M/week | Unmaintained (4+ years) | Runtime hook only — must be installed before errors are thrown. Cannot decode a collected stack string |
| `--enable-source-maps` | Built-in | Experimental | Runtime only. Performance issues with large bundles |
| `stacktrace-js` | ~4.7M/week | Unmaintained (6+ years) | Browser-only — fetches sourcemaps via XHR |
| `sourcemapped-stacktrace` | ~135K/week | Inactive | Browser-only — no Node.js disk-based resolution |

**`sourcemap-decoder` fills the gap:** post-hoc decoding of collected stack traces on the server, using `.map` files from disk. Framework-agnostic, maintained, works with any bundler.

## Install

```bash
npm install sourcemap-decoder
```

## Usage

Point it at your build output folder — that's it:

```ts
import { decodeStackTrace } from "sourcemap-decoder";

const result = decodeStackTrace(error.stack ?? "", {
  assetsPath: "./dist",
});

if (result.decoded) {
  console.error(result.stack);   // formatted, human-readable stack trace
  console.log(result.frames);    // individual decoded frames
}
```

**Before:**
```
at o (app.js:1:126)
at e (app.js:1:220)
```

**After:**
```
at validateEmail (src/utils.ts:10:10)
at initApp (src/app.ts:8:2)
```

### Next.js

```ts
const result = decodeStackTrace(error.stack ?? "", {
  assetsPath: ".next/static/chunks",
});
```

### Custom sourcemap resolution

For non-standard setups (nested paths, custom naming), override the defaults:

```ts
const result = decodeStackTrace(error.stack ?? "", {
  stackPattern: /(\/_next\/static\/chunks\/[^:]+\.js):(\d+):(\d+)/g,
  resolveSourceMap: (file) =>
    path.join(".next/static/chunks", file.replace(/^\/_next\/static\/chunks\//, "")) + ".map",
});
```

### Clean path patterns

By default, `webpack://` prefixes are stripped from source paths. Customize or disable:

```ts
// Custom prefix
const result = decodeStackTrace(stack, {
  assetsPath: "./dist",
  cleanPathPattern: /^webpack:\/\/my-app\//,
});

// Disable cleaning
const result = decodeStackTrace(stack, {
  assetsPath: "./dist",
  cleanPaths: false,
});
```

## How it works

1. Parses `.js:line:col` references from the stack trace
2. Finds `.map` files in your `assetsPath` directory
3. Maps minified positions to original source using `@jridgewell/trace-mapping`

### Single-line bundle handling

Some bundlers produce output where the sourcemap maps everything to line 1, but the runtime wraps the content into multiple lines. The runtime reports `line:3 col:42`, but the sourcemap only has mappings for `line:1`.

This library detects this case and recalculates the absolute column offset by summing line lengths, giving you the correct original position.

## API

### `decodeStackTrace(stack, options?)`

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `stack` | `string` | Yes | Raw stack trace from `Error.stack` |
| `options.assetsPath` | `string` | No* | Path to directory with `.js` and `.js.map` files |
| `options.stackPattern` | `RegExp` | No | Custom regex with `g` flag matching `(file):(line):(column)`. Default: any `.js:line:col` |
| `options.resolveSourceMap` | `(file: string) => string` | No | Custom function to resolve `.map` file path |
| `options.cleanPaths` | `boolean` | No | Strip prefixes from source paths. Default: `true` |
| `options.cleanPathPattern` | `RegExp` | No | Regex for path cleaning. Default: `/^webpack:\/\/\w+\//` |

\* At least `assetsPath` or `resolveSourceMap` should be provided.

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

- [sourcemap-decode-service](https://github.com/amadevstudio/source_dese) — standalone microservice with the same decoding logic and a REST API. Use when you need an HTTP endpoint instead of a library import.

## Requirements

- Node.js >= 18
- Server-side only (reads files from disk)
- `.map` files must be present in your build output

## License

MIT
