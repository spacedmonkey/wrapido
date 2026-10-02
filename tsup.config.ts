/**
 * External dependencies
 */
import { defineConfig } from 'tsup';

export default defineConfig( {
	// `src/bin.ts` is the executable (still dist/cli.js); it holds Node's
	// warnings, then dynamically imports src/cli.ts, which tsup splits into
	// its own chunk so the dependencies load only after that hold is in place.
	entry: { cli: 'src/bin.ts' },
	format: [ 'esm' ],
	target: 'node20',
	clean: true,
	dts: false,
	// Only emit a sourcemap when collecting coverage (`npm run coverage`) —
	// c8 needs it to map dist/cli.js's V8 coverage back to the original
	// src/*.ts lines, since the integration suite spawns the built CLI as a
	// child process rather than running it in-process. A normal `npm run
	// build` skips it, keeping the published package (`files: ["dist"]`)
	// free of an unused .map file.
	sourcemap: process.env.WRAPIDO_COVERAGE === 'true',
	banner: {
		js: '#!/usr/bin/env node',
	},
} );
