/**
 * External dependencies
 */
import { describe, expect, it, jest } from '@jest/globals';

/**
 * Internal dependencies
 */
import { createProgressBar } from '../../src/ui.js';

describe( 'createProgressBar', () => {
	it( 'restores the terminal on Ctrl-C only while the bar is running', () => {
		const before = process.listenerCount( 'SIGINT' );
		const bar = createProgressBar( 'Working', 2, true );
		expect( process.listenerCount( 'SIGINT' ) ).toBe( before + 1 );
		bar.finish();
		expect( process.listenerCount( 'SIGINT' ) ).toBe( before );
	} );

	it( 'still prints lines (e.g. errors) when the bar is disabled, but drops notes', () => {
		const write = jest
			.spyOn( process.stderr, 'write' )
			.mockImplementation( () => true );
		try {
			const bar = createProgressBar( 'Working', 2, false );
			bar.log( 'a note' );
			bar.print( 'an error' );
			expect( write.mock.calls.map( ( [ text ] ) => text ) ).toEqual( [
				'an error\n',
			] );
		} finally {
			write.mockRestore();
		}
	} );
} );
