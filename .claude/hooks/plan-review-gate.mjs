// PreToolUse hook on ExitPlanMode: denies plan approval until the plan's
// `## Plan review` log records at least 2 subagent review rounds (3 if round 2
// was still blocking). See issue #69 and CLAUDE.md's Workflow section.
import { readFileSync } from 'node:fs';

const MIN_ROUNDS = 2;
const MAX_ROUNDS = 3;

/**
 * Finds the plan text: the tool input first, else this session's plan file
 * as named in the transcript (never another session's or a subagent's).
 *
 * @param {Object} input Parsed hook JSON from stdin.
 * @return {string|undefined} The plan markdown, or undefined if not found.
 */
function findPlan( input ) {
	if ( typeof input.tool_input?.plan === 'string' ) {
		return input.tool_input.plan;
	}
	// ponytail: takes the last plan path the transcript mentions, which is this
	// session's own unless it later read another plan; key by session if that bites.
	try {
		const paths = readFileSync( input.transcript_path, 'utf8' )
			.match( /\/[^\s"'`\\]*\/\.claude\/plans\/[\w-]+\.md/g )
			?.filter( ( path ) => ! path.includes( '-agent-' ) );
		return paths?.length
			? readFileSync( paths[ paths.length - 1 ], 'utf8' )
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * Decides whether the plan has had enough review rounds.
 *
 * @param {string} plan The plan markdown.
 * @return {{allow: boolean, round: number}} Whether to allow approval, and the next round number if not.
 */
function decide( plan ) {
	const section =
		plan.split( /^## Plan review\s*$/m )[ 1 ]?.split( /^## /m )[ 0 ] ?? '';
	const rounds = [ ...section.matchAll( /^### Round \d+\b(.*)$/gm ) ];
	const lastClean = /verdict:\s*clean/i.test( rounds.at( -1 )?.[ 1 ] ?? '' );
	const allow =
		rounds.length >= MAX_ROUNDS ||
		( rounds.length >= MIN_ROUNDS && lastClean );
	return { allow, round: rounds.length + 1 };
}

/**
 * Reads the hook input and prints a deny decision when more review rounds are needed.
 */
function main() {
	const input = JSON.parse( readFileSync( 0, 'utf8' ) || '{}' ) ?? {};
	const plan = findPlan( input );
	if ( plan === undefined ) {
		process.stderr.write( 'plan-review-gate: no plan found, allowing.\n' );
		return;
	}

	const { allow, round } = decide( plan );
	if ( ! allow ) {
		const reason = [
			`Plan review round ${ round } of ${ MIN_ROUNDS }-${ MAX_ROUNDS } is required before approval.`,
			`Spawn the \`plan-reviewer\` agent with ONLY the plan file path and "round ${ round }" (no chat context).`,
			'Apply BLOCKING findings; apply NITs only in round 1 and only if cheap. Reject anything that undoes an earlier accepted decision (log it as "conflicts with R1-x").',
			`Then append to the plan's \`## Plan review\` section: \`### Round ${ round } - verdict: <blocking|clean>\` (the reviewer's verdict; no Verdict line = blocking), and one line per finding: \`- R${ round }-<n> BLOCKING|NIT accepted|rejected: <why>\`.`,
			round === MAX_ROUNDS
				? 'This is the final round: if it is still blocking, add `Unresolved blocking at cap: ...` listing the open items.'
				: '',
			'Then call ExitPlanMode again.',
		]
			.filter( Boolean )
			.join( '\n' );
		process.stdout.write(
			JSON.stringify( {
				hookSpecificOutput: {
					hookEventName: 'PreToolUse',
					permissionDecision: 'deny',
					permissionDecisionReason: reason,
				},
			} )
		);
	}
}

// Fail open: a bug or bad input here must never block a session.
try {
	main();
} catch ( error ) {
	process.stderr.write( `plan-review-gate: ${ error }, allowing.\n` );
}
