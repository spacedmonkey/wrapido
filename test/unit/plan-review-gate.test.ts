/**
 * External dependencies
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const GATE = join( __dirname, '../../.claude/hooks/plan-review-gate.mjs' );

/**
 * Runs the gate with the given hook input and reports whether it denied.
 *
 * @param input Hook JSON (or raw text) written to the script's stdin.
 * @return Whether the gate denied, plus its deny reason.
 */
function runGate( input: object | string ): {
	denied: boolean;
	reason: string;
} {
	const { stdout, status } = spawnSync( 'node', [ GATE ], {
		input: typeof input === 'string' ? input : JSON.stringify( input ),
		encoding: 'utf8',
	} );
	expect( status ).toBe( 0 );
	const reason: string = stdout
		? JSON.parse( stdout ).hookSpecificOutput.permissionDecisionReason
		: '';
	return { denied: stdout !== '', reason };
}

/**
 * Builds a plan whose review log holds the given round verdicts.
 *
 * @param verdicts One verdict suffix per round, e.g. `' - verdict: clean'`.
 * @return The plan markdown.
 */
function plan( ...verdicts: string[] ): string {
	const rounds = verdicts
		.map( ( v, i ) => `### Round ${ i + 1 }${ v }\n- R${ i + 1 }-1 ...` )
		.join( '\n' );
	return `# P\n\n## Context\nx\n\n## Plan review\n${ rounds }\n\n## Out of scope\n### Round 9 - verdict: clean\n`;
}

const B = ' - verdict: blocking';
const C = ' - verdict: clean';

describe( 'plan-review-gate', () => {
	it.each( [
		[ 'no review section', '# P\n', true, 1 ],
		[ 'one clean round', plan( C ), true, 2 ],
		[ 'two rounds, last blocking', plan( B, B ), true, 3 ],
		[ 'two rounds, missing verdict', plan( B, '' ), true, 3 ],
		[ 'two rounds, last clean', plan( B, C ), false, 0 ],
		[ 'three rounds, still blocking', plan( B, B, B ), false, 0 ],
	] )( '%s', ( _name, text, denied, round ) => {
		const result = runGate( { tool_input: { plan: text } } );
		expect( result.denied ).toBe( denied );
		if ( denied ) {
			expect( result.reason ).toContain( `round ${ round }` );
		}
	} );

	it( "falls back to this session's plan file from the transcript", () => {
		const dir = mkdtempSync( join( tmpdir(), 'gate-' ) );
		const planPath = join( dir, '.claude/plans/my-plan.md' );
		const agentPath = join( dir, '.claude/plans/my-plan-agent-x.md' );
		mkdirSync( join( dir, '.claude/plans' ), { recursive: true } );
		writeFileSync( planPath, plan( B, C ) );
		writeFileSync( agentPath, '# no review\n' );
		const transcript = join( dir, 't.jsonl' );
		writeFileSync(
			transcript,
			JSON.stringify( {
				text: `plan at ${ planPath } then ${ agentPath }`,
			} )
		);
		expect( runGate( { transcript_path: transcript } ).denied ).toBe(
			false
		);
	} );

	it.each( [ [ {} ], [ '' ], [ 'null' ], [ 'not json' ] ] )(
		'fails open on input %j',
		( input ) => {
			expect( runGate( input ).denied ).toBe( false );
		}
	);
} );
