/**
 * External dependencies
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Internal dependencies
 */
import { runCli } from './fixtures/run-cli.js';
import {
	getBatchSizes,
	setBatchBehavior,
	startFixture,
	type Fixture,
} from './fixtures/server.js';

let fixture: Fixture;

beforeAll( async () => {
	fixture = await startFixture();
} );

afterAll( async () => {
	await fixture.close();
} );

beforeEach( () => {
	setBatchBehavior();
} );

function run( args: string[], env?: Record< string, string > ) {
	return runCli(
		[ ...args, `--url=${ fixture.baseUrl }`, '--quiet', '--no-color' ],
		{ env }
	);
}

/**
 * Creates widgets and returns their ids.
 * @param count How many to create.
 * @return The new widgets' ids.
 */
async function createWidgets( count: number ): Promise< string[] > {
	const result = await run( [
		'wp/v2',
		'widgets',
		'generate',
		`--count=${ count }`,
		'--format=ids',
	] );
	expect( result.exitCode ).toBe( 0 );
	return result.stdout.trim().split( /\s+/ );
}

/**
 * Counts the fixture's widgets.
 * @return How many widgets exist.
 */
async function widgetCount(): Promise< number > {
	const result = await run( [ 'wp/v2', 'widgets', 'list', '--format=ids' ] );
	return result.stdout.trim().split( /\s+/ ).filter( Boolean ).length;
}

describe( 'generate via /batch/v1', () => {
	it( 'sends the first item alone, then batches of maxItems', async () => {
		const result = await run( [
			'wp/v2',
			'widgets',
			'generate',
			'--count=8',
			'--format=json',
		] );
		expect( result.exitCode ).toBe( 0 );
		// Item 1 alone, then 3 + 3; the last single item isn't worth a batch.
		expect( getBatchSizes() ).toEqual( [ 3, 3 ] );
		const created = JSON.parse( result.stdout ) as Array<
			Record< string, unknown >
		>;
		expect( created ).toHaveLength( 8 );
		// Batched items are re-fetched from Location like item 1 is, so the
		// POST-only `posted` marker is absent from every one of them.
		expect( created.some( ( item ) => 'posted' in item ) ).toBe( false );
		const ids = created.map( ( item ) => item.id as number );
		expect( [ ...ids ].sort( ( a, b ) => a - b ) ).toEqual( ids );
	} );

	it( 'does not batch two items', async () => {
		const result = await run( [
			'wp/v2',
			'widgets',
			'generate',
			'--count=2',
		] );
		expect( result.exitCode ).toBe( 0 );
		expect( getBatchSizes() ).toEqual( [] );
	} );

	it( 'stays sequential when the site has no /batch/v1 route', async () => {
		setBatchBehavior( { mode: 'absent' } );
		const result = await run( [
			'wp/v2',
			'widgets',
			'generate',
			'--count=4',
		] );
		expect( result.exitCode ).toBe( 0 );
		expect( result.stdout ).toMatch( /^Success: created 4 widgets: / );
		expect( getBatchSizes() ).toEqual( [] );
		expect( result.stderr ).toBe( '' );
	} );

	it( "stays sequential when /batch/v1's method enum excludes POST", async () => {
		setBatchBehavior( { methods: [ 'DELETE' ] } );
		const result = await run( [
			'wp/v2',
			'widgets',
			'generate',
			'--count=4',
			'--debug',
		] );
		expect( result.exitCode ).toBe( 0 );
		expect( getBatchSizes() ).toEqual( [] );
		expect( result.stderr ).toContain(
			"batch: not used (/batch/v1 doesn't accept POST)"
		);
	} );

	it( 'uses a larger advertised maxItems', async () => {
		setBatchBehavior( { maxItems: 10 } );
		const result = await run( [
			'wp/v2',
			'widgets',
			'generate',
			'--count=6',
		] );
		expect( result.exitCode ).toBe( 0 );
		expect( getBatchSizes() ).toEqual( [ 5 ] );
	} );

	it.each( [
		[ 'html-403', 'Access denied by the fixture firewall' ],
		[ 'json-200', 'unexpected response (status 200)' ],
		[ 'too-large', 'too large (HTTP 413)' ],
		[ 'not-allowed', 'rest_batch_not_allowed' ],
	] as const )(
		'falls back to one request per item when the batch is refused (%s), naming the cause even under --quiet',
		async ( mode, cause ) => {
			setBatchBehavior( { mode } );
			const result = await run( [
				'wp/v2',
				'widgets',
				'generate',
				'--count=5',
			] );
			expect( result.exitCode ).toBe( 0 );
			expect( result.stdout ).toMatch( /^Success: created 5 widgets: / );
			// One refused batch, then never again for this run.
			expect( getBatchSizes() ).toEqual( [ 3 ] );
			expect( result.stderr ).toContain(
				'Warning: Batch request failed ('
			);
			expect( result.stderr ).toContain( cause );
			expect( result.stderr ).toContain(
				'sending the remaining 4 items individually.'
			);
		}
	);

	it.each( [ 'timeout-504', 'html-200' ] as const )(
		'stops without resending when the outcome is unknown (%s)',
		async ( mode ) => {
			const before = await widgetCount();
			setBatchBehavior( { mode } );
			const result = await run( [
				'wp/v2',
				'widgets',
				'generate',
				'--count=7',
			] );
			expect( result.exitCode ).toBe( 1 );
			expect( getBatchSizes() ).toEqual( [ 3 ] );
			// The fixture ran the batch before failing, and nothing was resent.
			expect( await widgetCount() ).toBe( before + 4 );
			expect( result.stdout ).toMatch( /^Success: created 1 widgets: / );
			expect( result.stderr ).toContain(
				'Batch request for #2–#4 failed.'
			);
			expect( result.stderr ).toContain(
				'These items may or may not have been created.'
			);
			expect( result.stderr ).toContain( 'Not sent: #5–#7.' );
			expect( result.stderr ).toContain(
				'3 of 7 items may or may not have been created; 3 not sent.'
			);
			expect( result.stderr ).not.toContain( 'SyntaxError' );
			expect( result.stderr ).not.toMatch( /\n\s+at / );
		}
	);

	it( 'reports a failed item inside a batch, prints what was created, and stops', async () => {
		setBatchBehavior( { mode: 'fail-second' } );
		const result = await run( [
			'wp/v2',
			'widgets',
			'generate',
			'--count=7',
		] );
		expect( result.exitCode ).toBe( 1 );
		expect( getBatchSizes() ).toEqual( [ 3 ] );
		expect( result.stdout ).toMatch( /^Success: created 3 widgets: / );
		expect( result.stderr ).toContain(
			'#3: Error: The fixture rejected this item. (rest_invalid_param, status 400)'
		);
		expect( result.stderr ).toContain( 'Not sent: #5–#7.' );
	} );

	it( 'prints each distinct hint once, after the item errors', async () => {
		setBatchBehavior( { mode: 'fail-second', maxItems: 5 } );
		const result = await run( [
			'wp/v2',
			'widgets',
			'generate',
			'--count=6',
		] );
		expect( result.exitCode ).toBe( 1 );
		const lines = result.stderr.trim().split( '\n' );
		expect( lines ).toEqual( [
			'#3: Error: The fixture rejected this item. (rest_invalid_param, status 400)',
			'#5: Error: The fixture rejected this item. (rest_invalid_param, status 400)',
			expect.stringMatching( /^Hint: A field value is invalid/ ),
			'Warning: 2 of 6 items failed.',
		] );
	} );

	it( 'reports item failures as JSON lines under --format=json', async () => {
		setBatchBehavior( { mode: 'fail-second' } );
		const result = await run( [
			'wp/v2',
			'widgets',
			'generate',
			'--count=7',
			'--format=json',
		] );
		expect( result.exitCode ).toBe( 1 );
		expect( JSON.parse( result.stdout ) ).toHaveLength( 3 );
		const lines = result.stderr
			.trim()
			.split( '\n' )
			.map( ( line ) => JSON.parse( line ) );
		// JSON lines carry their own hint; no separate `Hint:` line.
		expect( lines ).toEqual( [
			{
				error: expect.objectContaining( {
					code: 'rest_invalid_param',
					status: 400,
				} ),
				index: 3,
			},
			{ not_sent: [ 5, 6, 7 ] },
		] );
	} );

	it( 'reports an unknown outcome as JSON in agent mode', async () => {
		setBatchBehavior( { mode: 'timeout-504' } );
		const result = await run(
			[ 'wp/v2', 'widgets', 'generate', '--count=4' ],
			{ WRAPIDO_AGENT: '1' }
		);
		expect( result.exitCode ).toBe( 1 );
		const unknown = result.stderr
			.trim()
			.split( '\n' )
			.filter( ( line ) => line.startsWith( '{' ) )
			.map( ( line ) => JSON.parse( line ) )
			.find( ( line ) => line.outcome === 'unknown' );
		expect( unknown ).toMatchObject( {
			error: { status: 504 },
			items: [ 2, 3, 4 ],
			outcome: 'unknown',
		} );
	} );

	it( 'logs each batch item under --debug, with no spinners or animated bar mixed in', async () => {
		// Without --quiet, so spinners and the progress bar would show.
		const result = await runCli( [
			'wp/v2',
			'widgets',
			'generate',
			'--count=3',
			'--debug',
			`--url=${ fixture.baseUrl }`,
			'--no-color',
		] );
		expect( result.exitCode ).toBe( 0 );
		expect( result.stderr ).toContain( '/wp-json/batch/v1' );
		expect( result.stderr ).toContain(
			'batch item 1: POST /wp/v2/widgets → 201'
		);
		expect( result.stderr ).toContain(
			'batch item 2: POST /wp/v2/widgets → 201'
		);
		// Plain start/finish lines instead of a redrawn bar or spinner frames.
		expect( result.stderr ).toMatch( /Generating wp\/v2\/widgets$/m );
		expect( result.stderr ).toContain(
			'Generating wp/v2/widgets: done (3/3).'
		);
		expect( result.stderr ).not.toMatch( /[\r⠋⠙⠹✔]/ );
	} );
} );

describe( 'get/update/delete with several ids', () => {
	it( 'deletes several ids in one batch', async () => {
		const ids = await createWidgets( 3 );
		setBatchBehavior();
		const result = await run( [ 'wp/v2', 'widgets', 'delete', ...ids ] );
		expect( result.exitCode ).toBe( 0 );
		expect( getBatchSizes() ).toEqual( [ 3 ] );
		expect( result.stdout.split( '\n' ) ).toEqual(
			ids.map( ( id ) => `Success: Deleted widgets ${ id }.` )
		);
	} );

	it( 'reports a bad id per id and exits 1', async () => {
		const ids = await createWidgets( 2 );
		setBatchBehavior();
		const result = await run( [
			'wp/v2',
			'widgets',
			'delete',
			...ids,
			'999999',
		] );
		expect( result.exitCode ).toBe( 1 );
		expect( result.stdout.split( '\n' ) ).toEqual(
			ids.map( ( id ) => `Success: Deleted widgets ${ id }.` )
		);
		expect( result.stderr ).toContain(
			'999999: Error: Invalid widget ID. (rest_widget_invalid_id, status 404)'
		);
		expect( result.stderr ).toContain( '1 of 3 ids failed.' );
	} );

	it( 'gives the same output one request at a time when batching is unavailable', async () => {
		const ids = await createWidgets( 2 );
		setBatchBehavior( { mode: 'absent' } );
		const result = await run( [ 'wp/v2', 'widgets', 'delete', ...ids ] );
		expect( result.exitCode ).toBe( 0 );
		expect( getBatchSizes() ).toEqual( [] );
		expect( result.stdout.split( '\n' ) ).toEqual(
			ids.map( ( id ) => `Success: Deleted widgets ${ id }.` )
		);
	} );

	it( 'updates several ids with the same fields', async () => {
		const ids = await createWidgets( 2 );
		setBatchBehavior();
		const result = await run( [
			'wp/v2',
			'widgets',
			'update',
			...ids,
			'--title=Renamed',
			'--format=json',
		] );
		expect( result.exitCode ).toBe( 0 );
		expect( getBatchSizes() ).toEqual( [ 2 ] );
		const updated = JSON.parse( result.stdout ) as Array< {
			id: number;
			title: { rendered: string };
		} >;
		expect( updated.map( ( w ) => String( w.id ) ) ).toEqual( ids );
		expect( updated.every( ( w ) => w.title.rendered === 'Renamed' ) ).toBe(
			true
		);
	} );

	it( 'gets several ids one at a time, since GET is not in the batch method enum', async () => {
		const ids = await createWidgets( 2 );
		setBatchBehavior();
		const result = await run( [
			'wp/v2',
			'widgets',
			'get',
			...ids,
			'--format=ids',
		] );
		expect( result.exitCode ).toBe( 0 );
		expect( result.stdout.trim().split( ' ' ) ).toEqual( ids );
		expect( getBatchSizes() ).toEqual( [] );
	} );

	it( 'batches get when the site adds GET to the method enum', async () => {
		const ids = await createWidgets( 2 );
		setBatchBehavior( {
			methods: [ 'GET', 'POST', 'PUT', 'PATCH', 'DELETE' ],
		} );
		const result = await run( [
			'wp/v2',
			'widgets',
			'get',
			...ids,
			'--format=ids',
		] );
		expect( result.exitCode ).toBe( 0 );
		expect( result.stdout.trim().split( ' ' ) ).toEqual( ids );
		expect( getBatchSizes() ).toEqual( [ 2 ] );
	} );

	it( 'keeps get with one id returning a single object', async () => {
		const [ id ] = await createWidgets( 1 );
		const result = await run( [
			'wp/v2',
			'widgets',
			'get',
			id as string,
			'--format=json',
		] );
		expect( Array.isArray( JSON.parse( result.stdout ) ) ).toBe( false );
	} );

	it( 'rejects several ids for exists', async () => {
		const result = await run( [ 'wp/v2', 'widgets', 'exists', '1', '2' ] );
		expect( result.exitCode ).toBe( 1 );
	} );
} );

describe( '<id>... in help', () => {
	it( 'shows <id>... and its description in --help', async () => {
		const result = await run( [ 'wp/v2', 'widgets', 'delete', '--help' ] );
		expect( result.exitCode ).toBe( 0 );
		expect( result.stdout ).toContain(
			'wrapido wp/v2 widgets delete <id>... [--force]'
		);
		expect( result.stdout ).toMatch(
			/OPTIONS\n\n {2}<id>\.\.\.\n {4}One or more IDs of widgets to delete\./
		);
		expect( result.stdout ).toContain(
			'wrapido wp/v2 widgets delete 123 456'
		);
	} );

	it( 'keeps a single <id> for exists', async () => {
		const result = await run( [ 'wp/v2', 'widgets', 'exists', '--help' ] );
		expect( result.stdout ).toContain(
			'wrapido wp/v2 widgets exists <id>'
		);
		expect( result.stdout ).not.toContain( 'exists <id>...' );
	} );

	it( 'exposes the positional in JSON help', async () => {
		const result = await run( [
			'help',
			'wp/v2',
			'widgets',
			'delete',
			'--format=json',
		] );
		expect( JSON.parse( result.stdout ).positional ).toEqual( {
			name: 'id',
			repeating: true,
			required: true,
			description: 'One or more IDs of widgets to delete.',
		} );
	} );
} );
