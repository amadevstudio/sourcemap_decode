# sourcemap-decode

Decode production stack traces to original source locations using local `.map` files. Pass `Error.stack` string in, get readable stack trace out. Sourcemaps stay on your server, no external services needed.

## Why?

`@jridgewell/trace-mapping` gives you original position by `line:column`, but to decode a real production error you still need to parse `Error.stack`, find the right `.map` file on disk, handle single-line bundles (where runtime line numbers don't match sourcemap lines), and format the output. This package does all of that in one call.

Existing alternatives either work only at runtime (`source-map-support`, `--enable-source-maps`) or only in the browser (`stacktrace-js`, `sourcemapped-stacktrace`). `sourcemap-decode` decodes already collected stack trace strings on the server side.

## Install

```bash
npm install sourcemap-decode
```

## Usage

Point it at your build output folder — that's it:

```ts
import { decodeStackTrace } from "sourcemap-decode";

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

### CLI (pipe mode)

Pipe any command's output through the CLI to decode stack traces on the fly:

```bash
node app.js 2>&1 | npx sourcemap-decode --assets ./dist
```

### Next.js

```ts
const result = decodeStackTrace(error.stack ?? "", {
  assetsPath: ".next/static/chunks",
});
```

### Custom sourcemap resolution

If your `.map` files don't sit next to the bundles, pass custom `stackPattern` and `resolveSourceMap`:

```ts
const result = decodeStackTrace(error.stack ?? "", {
  stackPattern: /(\/_next\/static\/chunks\/[^:]+\.js):(\d+):(\d+)/g,
  resolveSourceMap: (file) =>
    path.join(".next/static/chunks", file.replace(/^\/_next\/static\/chunks\//, "")) + ".map",
});
```

### Clean path patterns

`webpack://` prefixes are stripped by default. You can change the pattern or turn it off:

```ts
const result = decodeStackTrace(stack, {
  assetsPath: "./dist",
  cleanPathPattern: /^webpack:\/\/my-app\//,
});

const result = decodeStackTrace(stack, {
  assetsPath: "./dist",
  cleanPaths: false,
});
```

## API

### `decodeStackTrace(stack, options?)`

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `stack` | `string` | Yes | Raw stack trace from `Error.stack` |
| `options.assetsPath` | `string` | No* | Path to directory with `.js` and `.js.map` files |
| `options.stackPattern` | `RegExp` | No | Regex with `g` flag matching `(file):(line):(column)`. Default: any `.js:line:col` |
| `options.resolveSourceMap` | `(file: string) => string` | No | Custom `.map` file path resolver |
| `options.cleanPaths` | `boolean` | No | Strip prefixes from source paths. Default: `true` |
| `options.cleanPathPattern` | `RegExp` | No | Prefix pattern to strip. Default: `/^webpack:\/\/\w+\//` |

\* Either `assetsPath` or `resolveSourceMap` is required.

Returns `DecodeResult`.

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

- [sourcemap-decode-service](https://github.com/amadevstudio/source_dese) - HTTP microservice with the same decoding logic and a REST API

## Requirements

- Node.js >= 18
- Server-side only (reads `.map` files from disk)

## License

MIT
