/**
 * External dependencies
 */
import { afterAll } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Jest `setupFilesAfterEnv` entry, run before each test file is loaded: points the config store
 * at a scratch directory, so a test that loads `src/config.ts` (even
 * indirectly, e.g. through the auth commands) never reads or writes the real
 * one on the machine running the suite. `WRAPIDO_CONFIG_DIR` rather than
 * `XDG_CONFIG_HOME`, which macOS and Windows ignore.
 */
const configDir = mkdtempSync( join( tmpdir(), 'wrapido-unit-config-' ) );
process.env.WRAPIDO_CONFIG_DIR = configDir;
afterAll( () => rmSync( configDir, { recursive: true, force: true } ) );
