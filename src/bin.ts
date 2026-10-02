/**
 * Internal dependencies
 */
import { holdProcessWarnings } from './core/warnings.js';

// The executable entry point (built as dist/cli.js). Node may print its own
// warnings while the CLI's dependencies load, before `--quiet` is known, so
// they're held first and the CLI itself is loaded afterwards, dynamically: a
// static import would load every dependency before this line runs.
holdProcessWarnings();
await import( './cli.js' );
