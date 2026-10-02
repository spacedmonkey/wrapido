/**
 * Internal dependencies
 */
import {
	responseFromEnvelope,
	type Envelope,
	type WpRestClient,
	type WpResponse,
} from './client.js';
import { debugLog } from './debug.js';
import { CliError, WpApiError } from './errors.js';
import type { VerbRequest } from './verbs.js';
import type { IndexResponse } from '../types.js';

/** What a site's `/batch/v1` route accepts, read from its own schema. */
export interface BatchCapabilities {
	/** The most sub-requests one batch may carry (`rest_get_max_batch_size`). */
	maxItems: number;
	/** The HTTP methods a sub-request may use. */
	methods: string[];
}

/** One batched item's outcome: its response, or the error it returned. */
export type BatchItemResult = WpResponse | WpApiError | CliError;

/**
 * A sent batch's outcome. `unavailable` means the site refused the batch as a
 * whole before running anything (e.g. a firewall's 403, a 413, a 404), so its
 * items can safely be resent one at a time.
 */
export type BatchChunkOutcome =
	| { kind: 'results'; results: BatchItemResult[] }
	| { kind: 'unavailable'; error: Error };

/** WordPress core's own method enum, for a schema that doesn't declare one. */
const STOCK_METHODS = [ 'POST', 'PUT', 'PATCH', 'DELETE' ];

/** WordPress core's default `rest_get_max_batch_size`. */
const STOCK_MAX_ITEMS = 25;

/**
 * Default timeout for one batch request: under Cloudflare's 125 s edge limit,
 * since a batch runs many writes in one request. `--timeout` overrides it.
 */
export const BATCH_TIMEOUT_MS = 110_000;

/**
 * Reads the site's batch limits from its `/batch/v1` route in the root index:
 * how many sub-requests fit in one batch, and which methods they may use.
 * Both come from the live schema, since a site can filter either.
 * @param index The site's root REST API index.
 * @return The limits, or undefined if the site has no usable batch route
 *         (WordPress before 5.6, or the route was removed).
 */
export function batchCapabilities(
	index: IndexResponse
): BatchCapabilities | undefined {
	const endpoint = index.routes?.[ '/batch/v1' ]?.endpoints?.find(
		( e ) => e.methods?.includes( 'POST' )
	);
	if ( ! endpoint ) {
		return undefined;
	}
	const requests = endpoint.args?.requests as
		| {
				maxItems?: unknown;
				items?: { properties?: { method?: { enum?: unknown } } };
		  }
		| undefined;
	const maxItems =
		typeof requests?.maxItems === 'number'
			? Math.floor( requests.maxItems )
			: STOCK_MAX_ITEMS;
	if ( maxItems < 2 ) {
		// A batch of one is just a slower single request.
		return undefined;
	}
	const methodEnum = requests?.items?.properties?.method?.enum;
	const methods = Array.isArray( methodEnum )
		? methodEnum.map( ( m ) => String( m ).toUpperCase() )
		: STOCK_METHODS;
	return { maxItems, methods };
}

/**
 * Whether requests with `method` against the route at `routeKey` can be
 * batched: the batch route must accept the method, and the route's own
 * endpoint for it must opt in with `allow_batch: { v1: true }` (WordPress 5.9+
 * exposes this in the index; `{ v1: false }` is an explicit opt-out).
 * @param index    The site's root REST API index.
 * @param caps     The site's batch limits, from {@link batchCapabilities}.
 * @param method   The sub-requests' HTTP method.
 * @param routeKey The route's key in `index.routes` (its regex form).
 * @return Whether to batch.
 */
export function canBatch(
	index: IndexResponse,
	caps: BatchCapabilities,
	method: string,
	routeKey: string
): boolean {
	if ( ! caps.methods.includes( method ) ) {
		return false;
	}
	const endpoint = index.routes?.[ routeKey ]?.endpoints?.find(
		( e ) => e.methods?.includes( method )
	);
	const allowBatch = endpoint?.allow_batch;
	return !! allowBatch && allowBatch.v1 === true;
}

/**
 * The batch route's URL for a REST API root, including a plain-permalink
 * `?rest_route=/` root.
 * @param apiRoot The REST API root URL.
 * @return The `/batch/v1` URL.
 */
function batchUrl( apiRoot: string ): string {
	const root = new URL( apiRoot );
	if ( root.searchParams.has( 'rest_route' ) ) {
		root.searchParams.set( 'rest_route', '/batch/v1' );
		return root.toString();
	}
	return new URL( 'batch/v1', root ).toString();
}

/**
 * A request URL as a batch sub-request `path`: relative to the REST root,
 * with a leading `/` and its query string.
 * @param url     The request's absolute URL.
 * @param apiRoot The REST API root URL.
 * @return The path, e.g. `/wp/v2/posts/5?force=true`.
 */
export function batchPath( url: string, apiRoot: string ): string {
	const target = new URL( url );
	const rootPath = new URL( apiRoot ).pathname.replace( /\/?$/, '/' );
	const pathname = decodeURI( target.pathname );
	const relative = pathname.startsWith( rootPath )
		? pathname.slice( rootPath.length )
		: pathname.replace( /^\//, '' );
	return `/${ relative }${ target.search }`;
}

/**
 * Whether a batch POST's error means the site never ran any of its items:
 * a 4xx for the batch as a whole (a firewall's 403, a 404, a 413), except a
 * timeout (408) or rate limit (429), which say nothing either way.
 * @param error The error the batch POST threw.
 * @return Whether resending the items one at a time is safe.
 */
function nothingRan( error: unknown ): boolean {
	const status =
		error instanceof WpApiError || error instanceof CliError
			? error.status
			: undefined;
	return (
		status !== undefined &&
		status >= 400 &&
		status < 500 &&
		status !== 408 &&
		status !== 429
	);
}

/**
 * Whether a parsed value looks like one batch item's response envelope.
 * @param value One entry of the batch response's `responses` array.
 * @return Whether it has a numeric `status`.
 */
function isEnvelope( value: unknown ): value is Envelope {
	return (
		!! value &&
		typeof value === 'object' &&
		typeof ( value as Envelope ).status === 'number'
	);
}

/**
 * Sends up to `maxItems` requests as one `POST /batch/v1`, with `normal`
 * validation so one bad item doesn't block the rest.
 *
 * Resolves `unavailable` when the site refused the batch before running
 * anything. Throws when the outcome is unknown — a timeout, network error,
 * 5xx, or unparseable body — since WordPress may have run some or all of the
 * items, and resending them could create duplicates.
 * @param client  The REST client (carries auth).
 * @param apiRoot The REST API root URL.
 * @param items   The requests to send, as built by `buildVerbRequest`.
 * @param debug   Whether to log each item's status.
 * @return Each item's result, in order, or `unavailable`.
 */
export async function sendBatchChunk(
	client: WpRestClient,
	apiRoot: string,
	items: VerbRequest[],
	debug = false
): Promise< BatchChunkOutcome > {
	const requests = items.map( ( item ) => ( {
		method: item.method,
		path: batchPath( item.url, apiRoot ),
		...( item.body !== undefined ? { body: item.body } : {} ),
	} ) );

	let response: WpResponse< { responses?: unknown } | undefined >;
	try {
		response = await client.request( batchUrl( apiRoot ), {
			method: 'POST',
			body: { validation: 'normal', requests },
			timeoutMs: BATCH_TIMEOUT_MS,
		} );
	} catch ( error ) {
		if ( nothingRan( error ) ) {
			return { kind: 'unavailable', error: error as Error };
		}
		throw error;
	}

	const responses = response.body?.responses;
	if (
		! Array.isArray( responses ) ||
		responses.length !== items.length ||
		! responses.every( isEnvelope )
	) {
		// JSON, but not WordPress's batch handler answering (e.g. a proxy).
		return {
			kind: 'unavailable',
			error: new CliError(
				`The batch endpoint returned an unexpected response (status ${ response.status }).`,
				response.headers,
				response.status
			),
		};
	}

	const results = responses.map( ( envelope, i ): BatchItemResult => {
		if ( debug ) {
			const request = requests[ i ];
			const code = ( envelope.body as { code?: unknown } | null )?.code;
			debugLog(
				`  batch item ${
					i + 1
				}: ${ request?.method } ${ request?.path } → ${
					envelope.status
				}${
					envelope.status >= 400 && typeof code === 'string'
						? ` ${ code }`
						: ''
				}`
			);
		}
		try {
			return responseFromEnvelope( envelope );
		} catch ( error ) {
			return error as WpApiError | CliError;
		}
	} );

	// The index said this route allows batching but the server disagrees.
	// That check runs before any item, so nothing ran.
	if (
		results.every(
			( r ) =>
				r instanceof WpApiError && r.code === 'rest_batch_not_allowed'
		)
	) {
		return { kind: 'unavailable', error: results[ 0 ] as WpApiError };
	}
	return { kind: 'results', results };
}
