/**
 * Internal dependencies
 */
import { sendBatchChunk } from '../core/batch.js';
import type { WpRestClient, WpResponse } from '../core/client.js';
import {
	CliError,
	errorHint,
	formatErrorForDisplay,
	formatErrorForJson,
	WpApiError,
} from '../core/errors.js';
import type { VerbRequest } from '../core/verbs.js';
import { pc, warn } from '../ui.js';

/** What {@link runItems} produced. */
export interface RunItemsResult {
	/** Each succeeded item's result, in order. */
	results: unknown[];
	/** The position of each entry in `results`. */
	succeeded: number[];
	/** Whether any item failed, may have failed, or wasn't sent. */
	failed: boolean;
	/** How many items failed, have an unknown outcome, or weren't sent. */
	counts: ShortfallCounts;
}

/** How many items of a run didn't succeed, by reason. */
export interface ShortfallCounts {
	failed: number;
	unknown: number;
	notSent: number;
}

/**
 * The end-of-run summary for items that didn't succeed, naming only the
 * reasons that apply: `2 of 2 ids failed.`, `1 of 7 items failed; 3 not
 * sent.`, `3 of 7 items may or may not have been created; 3 not sent.`
 * @param counts   How many items didn't succeed, by reason.
 * @param total    How many items the run had.
 * @param noun     What the items are called (`items`, `ids`).
 * @param pastVerb What a success does, for the unknown case (`created`).
 * @return The summary sentence.
 */
export function describeShortfall(
	counts: ShortfallCounts,
	total: number,
	noun: string,
	pastVerb: string
): string {
	const parts: Array< [ number, string ] > = [];
	if ( counts.failed ) {
		parts.push( [ counts.failed, 'failed' ] );
	}
	if ( counts.unknown ) {
		parts.push( [
			counts.unknown,
			`may or may not have been ${ pastVerb }`,
		] );
	}
	if ( counts.notSent ) {
		parts.push( [ counts.notSent, 'not sent' ] );
	}
	return `${ parts
		.map( ( [ n, text ], k ) =>
			k === 0
				? `${ n } of ${ total } ${ noun } ${ text }`
				: `${ n } ${ text }`
		)
		.join( '; ' ) }.`;
}

export interface RunItemsOptions {
	/** How many items to run (addressed by 0-based position). */
	count: number;
	/** An item's identifier for messages and JSON: a 1-based index or an id. */
	key: ( i: number ) => number | string;
	/** The JSON field name for {@link RunItemsOptions.key} (`index` or `id`). */
	keyName: 'index' | 'id';
	/** Human label for an item, e.g. `#14` or `99`. */
	label: ( i: number ) => string;
	/** Sends one item on its own and returns its result. */
	sendOne: ( i: number ) => Promise< unknown >;
	/** Batches items when set: the site's limit, how to build and finish each. */
	batch?: {
		maxItems: number;
		build: ( i: number ) => VerbRequest;
		finish: ( response: WpResponse, i: number ) => Promise< unknown >;
	};
	/** Send the first item alone and rethrow its error as-is (generate's recovery needs it). */
	firstAlone: boolean;
	client: WpRestClient;
	apiRoot: string;
	debug: boolean;
	/** Print errors as JSON lines (agent mode / `--format=json`). */
	json: boolean;
	/** Prints one stderr line without disturbing a progress bar. */
	say: ( line: string ) => void;
	/** Advances the progress bar by one item. */
	tick: () => void;
	/** Hint for a batch whose outcome is unknown, e.g. how to check what exists. */
	unknownHint: string;
}

/**
 * Runs `count` requests, batching them through `/batch/v1` where allowed and
 * one at a time otherwise. Stops at the first request that reports a failure
 * (a batch counts as one request: its other items already ran) and reports
 * what failed, what may or may not have happened, and what wasn't sent.
 *
 * A batch the site refuses before running anything (firewall 403, 404, 413…)
 * switches the rest of the run to one request per item, with a warning naming
 * the cause. A batch whose outcome is unknown (timeout, 5xx, unreadable
 * body) is never resent, since WordPress may have run it.
 * @param opts What to run and how to report it.
 * @return The succeeded items' results and positions, and whether any failed.
 */
export async function runItems(
	opts: RunItemsOptions
): Promise< RunItemsResult > {
	const results: unknown[] = [];
	const succeeded: number[] = [];
	const counts: ShortfallCounts = { failed: 0, unknown: 0, notSent: 0 };
	// Each distinct hint is printed once at the end, not after every item.
	const hints = new Set< string >();
	let batching = Boolean( opts.batch );
	let i = 0;

	const done = ( failed: boolean ): RunItemsResult => {
		if ( ! opts.json ) {
			for ( const hint of hints ) {
				opts.say( `Hint: ${ hint }` );
			}
		}
		return { results, succeeded, failed, counts };
	};

	const range = ( from: number, to: number ) =>
		Array.from(
			{ length: Math.max( 0, to - from ) },
			( _, k ) => from + k
		);

	const reportItemError = ( error: unknown, item: number ) => {
		counts.failed++;
		const hint = errorHint( error );
		if ( hint ) {
			hints.add( hint );
		}
		opts.say(
			opts.json
				? JSON.stringify( {
						...JSON.parse( formatErrorForJson( error ) ),
						[ opts.keyName ]: opts.key( item ),
					} )
				: pc.red(
						`${ opts.label( item ) }: ${ formatErrorForDisplay(
							error,
							{ hint: false }
						) }`
					)
		);
	};

	const reportNotSent = ( from: number ) => {
		const items = range( from, opts.count );
		if ( ! items.length ) {
			return;
		}
		counts.notSent = items.length;
		opts.say(
			opts.json
				? JSON.stringify( { not_sent: items.map( opts.key ) } )
				: `Not sent: ${ describe( items ) }.`
		);
	};

	const describe = ( items: number[] ) =>
		opts.keyName === 'index' && items.length > 1
			? `${ opts.label( items[ 0 ] as number ) }–${ opts.label(
					items[ items.length - 1 ] as number
				) }`
			: items.map( opts.label ).join( ', ' );

	while ( i < opts.count ) {
		const remaining = opts.count - i;
		if (
			batching &&
			opts.batch &&
			remaining >= 2 &&
			! ( opts.firstAlone && i === 0 )
		) {
			const end = Math.min( opts.count, i + opts.batch.maxItems );
			const items = range( i, end );
			let outcome;
			try {
				outcome = await sendBatchChunk(
					opts.client,
					opts.apiRoot,
					items.map( opts.batch.build ),
					opts.debug
				);
			} catch ( error ) {
				// Unknown outcome: WordPress may have run any of these items.
				counts.unknown = items.length;
				if (
					( error instanceof WpApiError ||
						error instanceof CliError ) &&
					! error.hint
				) {
					error.hint = opts.unknownHint;
				}
				opts.say(
					opts.json
						? JSON.stringify( {
								...JSON.parse( formatErrorForJson( error ) ),
								items: items.map( opts.key ),
								outcome: 'unknown',
							} )
						: pc.red(
								`Batch request for ${ describe(
									items
								) } failed. ${ formatErrorForDisplay( error ) }`
							)
				);
				reportNotSent( end );
				return done( true );
			}

			if ( outcome.kind === 'unavailable' ) {
				batching = false;
				const reason = formatErrorForDisplay( outcome.error )
					.replace( /^Error: /, '' )
					.split( '\n' )[ 0 ];
				opts.say(
					opts.json
						? JSON.stringify( {
								...JSON.parse(
									formatErrorForJson( outcome.error )
								),
								outcome: 'sent_individually',
							} )
						: warn(
								`Batch request failed (${ reason }); sending the remaining ${ remaining } items individually.`
							)
				);
				continue;
			}

			let anyFailed = false;
			for ( const [ k, result ] of outcome.results.entries() ) {
				const item = items[ k ] as number;
				if ( result instanceof Error ) {
					anyFailed = true;
					reportItemError( result, item );
				} else {
					results.push( await opts.batch.finish( result, item ) );
					succeeded.push( item );
				}
				opts.tick();
			}
			i = end;
			if ( anyFailed ) {
				reportNotSent( end );
				return done( true );
			}
			continue;
		}

		try {
			results.push( await opts.sendOne( i ) );
			succeeded.push( i );
		} catch ( error ) {
			if ( opts.firstAlone && i === 0 ) {
				throw error;
			}
			opts.tick();
			reportItemError( error, i );
			reportNotSent( i + 1 );
			return done( true );
		}
		opts.tick();
		i++;
	}
	return done( false );
}
