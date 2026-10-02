/**
 * External dependencies
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Internal dependencies
 */
import {
	batchCapabilities,
	batchPath,
	canBatch,
} from '../../src/core/batch.js';
import { WpRestClient } from '../../src/core/client.js';
import { CliError, parseErrorResponse } from '../../src/core/errors.js';
import { itemRouteKey } from '../../src/core/indexer.js';
import type { IndexResponse, RouteSchema } from '../../src/types.js';

/**
 * Builds a minimal index with a `/batch/v1` route.
 * @param requests The batch route's `requests` arg schema, or null to omit the route.
 * @param routes   Extra routes.
 * @return The index.
 */
function indexWith(
	requests: Record< string, unknown > | null,
	routes: Record< string, Partial< RouteSchema > > = {}
): IndexResponse {
	return {
		namespaces: [ 'wp/v2' ],
		routes: {
			...( requests
				? {
						'/batch/v1': {
							namespace: '',
							methods: [ 'POST' ],
							endpoints: [
								{ methods: [ 'POST' ], args: { requests } },
							],
						},
				  }
				: {} ),
			...( routes as Record< string, RouteSchema > ),
		},
	};
}

const stockRequests = {
	maxItems: 25,
	items: {
		properties: {
			method: { enum: [ 'POST', 'PUT', 'PATCH', 'DELETE' ] },
		},
	},
};

describe( 'batchCapabilities', () => {
	it( 'reads maxItems and the method enum from the batch route', () => {
		expect( batchCapabilities( indexWith( stockRequests ) ) ).toEqual( {
			maxItems: 25,
			methods: [ 'POST', 'PUT', 'PATCH', 'DELETE' ],
		} );
	} );

	it( 'honours a filtered maxItems and method enum', () => {
		expect(
			batchCapabilities(
				indexWith( {
					maxItems: 100,
					items: {
						properties: { method: { enum: [ 'get', 'POST' ] } },
					},
				} )
			)
		).toEqual( { maxItems: 100, methods: [ 'GET', 'POST' ] } );
	} );

	it( "falls back to WordPress's defaults only when the schema omits them", () => {
		expect( batchCapabilities( indexWith( {} ) ) ).toEqual( {
			maxItems: 25,
			methods: [ 'POST', 'PUT', 'PATCH', 'DELETE' ],
		} );
	} );

	it( 'is undefined without a /batch/v1 route (WordPress 5.5, or removed)', () => {
		expect( batchCapabilities( indexWith( null ) ) ).toBeUndefined();
	} );

	it( 'is undefined when a batch could only hold one item', () => {
		expect(
			batchCapabilities( indexWith( { maxItems: 1 } ) )
		).toBeUndefined();
	} );
} );

describe( 'canBatch', () => {
	const index = indexWith( stockRequests, {
		'/wp/v2/posts': {
			endpoints: [
				{ methods: [ 'GET' ], allow_batch: { v1: true } },
				{ methods: [ 'POST' ], allow_batch: { v1: true } },
			],
		},
		'/wp/v2/global-styles/(?P<id>[\\d]+)': {
			endpoints: [ { methods: [ 'POST' ], allow_batch: { v1: false } } ],
		},
		'/wp/v2/media': { endpoints: [ { methods: [ 'POST' ] } ] },
	} );
	const caps = batchCapabilities( index )!;

	it( 'allows a method the batch route accepts on a route that opts in', () => {
		expect( canBatch( index, caps, 'POST', '/wp/v2/posts' ) ).toBe( true );
	} );

	it( 'refuses a method missing from the batch enum, even if the route opts in', () => {
		expect( canBatch( index, caps, 'GET', '/wp/v2/posts' ) ).toBe( false );
	} );

	it( 'allows GET once the enum includes it', () => {
		const withGet = { ...caps, methods: [ ...caps.methods, 'GET' ] };
		expect( canBatch( index, withGet, 'GET', '/wp/v2/posts' ) ).toBe(
			true
		);
	} );

	it( 'treats allow_batch { v1: false } as an opt-out', () => {
		expect(
			canBatch(
				index,
				caps,
				'POST',
				'/wp/v2/global-styles/(?P<id>[\\d]+)'
			)
		).toBe( false );
	} );

	it( 'refuses a route without allow_batch, or missing from the index', () => {
		expect( canBatch( index, caps, 'POST', '/wp/v2/media' ) ).toBe( false );
		expect( canBatch( index, caps, 'POST', '/wp/v2/nope' ) ).toBe( false );
	} );
} );

describe( 'batchPath', () => {
	it( 'makes a request URL relative to the REST root, keeping its query', () => {
		expect(
			batchPath(
				'https://example.com/wp-json/wp/v2/posts/5?force=true',
				'https://example.com/wp-json/'
			)
		).toBe( '/wp/v2/posts/5?force=true' );
	} );

	it( 'handles a plain-permalink root', () => {
		expect(
			batchPath(
				'https://example.com/wp/v2/posts',
				'https://example.com/?rest_route=/'
			)
		).toBe( '/wp/v2/posts' );
	} );
} );

describe( 'itemRouteKey', () => {
	it( "finds a collection's item route", () => {
		const index = indexWith( null, {
			'/wp/v2/posts': {},
			'/wp/v2/posts/(?P<id>[\\d]+)': {},
			'/wp/v2/posts/(?P<parent>[\\d]+)/revisions': {},
		} );
		expect( itemRouteKey( index, 'wp/v2', 'posts' ) ).toBe(
			'/wp/v2/posts/(?P<id>[\\d]+)'
		);
		expect( itemRouteKey( index, 'wp/v2', 'posts/revisions' ) ).toBe(
			'/wp/v2/posts/(?P<parent>[\\d]+)/revisions'
		);
		expect( itemRouteKey( index, 'wp/v2', 'pages' ) ).toBeUndefined();
	} );
} );

describe( 'error status for non-JSON responses', () => {
	afterEach( () => {
		jest.restoreAllMocks();
	} );

	it( 'keeps the HTTP status on a CliError from an HTML error page', async () => {
		const error = await parseErrorResponse(
			new Response( '<h1>Forbidden</h1>', { status: 403 } )
		);
		expect( error ).toBeInstanceOf( CliError );
		expect( ( error as CliError ).status ).toBe( 403 );
		expect( error.message ).toContain( 'Forbidden' );
	} );

	it( 'turns a non-JSON 2xx body into a CliError with its status, not a SyntaxError', async () => {
		jest.spyOn( globalThis, 'fetch' ).mockResolvedValue(
			new Response( '<b>Warning</b>: oops {"responses":[]}', {
				status: 200,
			} )
		);
		const request = new WpRestClient().request(
			'https://example.com/wp-json/'
		);
		await expect( request ).rejects.toBeInstanceOf( CliError );
		await expect( request ).rejects.toMatchObject( { status: 200 } );
	} );
} );
