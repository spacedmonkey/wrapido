/**
 * Node's own process warnings (e.g. `ExperimentalWarning: Importing JSON
 * modules ...`, which some Node versions print while a dependency loads) can
 * fire before `--quiet` is known. They're held from startup until the flags
 * are resolved, then printed — or, under `--quiet`, dropped along with any
 * later ones.
 */

type EmitWarningArgs = Parameters< typeof process.emitWarning >;
type Emit = ( ...args: EmitWarningArgs ) => void;

let state: 'hold' | 'show' | 'drop' = 'show';
const held: EmitWarningArgs[] = [];
let emitOriginal: Emit | undefined;

/**
 * Starts holding process warnings. Call first thing, before the rest of the
 * CLI (and its dependencies) is imported.
 */
export function holdProcessWarnings(): void {
	if ( ! emitOriginal ) {
		const original = process.emitWarning.bind( process ) as Emit;
		emitOriginal = original;
		process.emitWarning = ( ( ...args: EmitWarningArgs ) => {
			if ( state === 'hold' ) {
				held.push( args );
			} else if ( state === 'show' ) {
				original( ...args );
			}
		} ) as typeof process.emitWarning;
	}
	state = 'hold';
}

/**
 * Prints the held warnings and lets later ones through, or, under `--quiet`,
 * drops them and every later one. A no-op unless warnings are being held.
 * @param quiet Whether `--quiet` is in effect.
 */
export function releaseProcessWarnings( quiet: boolean ): void {
	if ( state !== 'hold' ) {
		return;
	}
	state = quiet ? 'drop' : 'show';
	const pending = held.splice( 0 );
	if ( ! quiet ) {
		for ( const args of pending ) {
			emitOriginal?.( ...args );
		}
	}
}
