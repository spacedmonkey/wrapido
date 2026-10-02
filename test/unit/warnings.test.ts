/**
 * External dependencies
 */
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';

/**
 * Internal dependencies
 */
import {
	holdProcessWarnings,
	releaseProcessWarnings,
} from '../../src/core/warnings.js';

const realEmitWarning = process.emitWarning;
// Stands in for Node's own emitWarning, so nothing reaches stderr.
const nodeEmit = jest.fn();

beforeAll( () => {
	process.emitWarning = nodeEmit as unknown as typeof process.emitWarning;
} );

afterAll( () => {
	process.emitWarning = realEmitWarning;
} );

describe( 'process warnings', () => {
	it( 'holds warnings until released, then prints them and later ones', () => {
		holdProcessWarnings();
		process.emitWarning( 'early', 'ExperimentalWarning' );
		expect( nodeEmit ).not.toHaveBeenCalled();

		releaseProcessWarnings( false );
		process.emitWarning( 'late' );
		expect( nodeEmit.mock.calls ).toEqual( [
			[ 'early', 'ExperimentalWarning' ],
			[ 'late' ],
		] );
	} );

	it( 'drops held and later warnings under --quiet', () => {
		nodeEmit.mockClear();
		holdProcessWarnings();
		process.emitWarning( 'early', 'ExperimentalWarning' );
		releaseProcessWarnings( true );
		process.emitWarning( 'late' );
		releaseProcessWarnings( false ); // a second release changes nothing
		process.emitWarning( 'later' );
		expect( nodeEmit ).not.toHaveBeenCalled();
	} );
} );
