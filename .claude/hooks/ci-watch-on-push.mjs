#!/usr/bin/env node
/**
 * PostToolUse hook on Bash: after a `git push` or `gh pr create`, tell Claude
 * to run the fix-ci skill (watch the checks, fix failures, push again).
 * Prints nothing for any other command, and fails open on unreadable input.
 */

let input = '';
for await ( const chunk of process.stdin ) {
	input += chunk;
}

let command = '';
try {
	command = JSON.parse( input )?.tool_input?.command ?? '';
} catch {
	// Fail open: unreadable input means no reminder.
}

// Only a real command (start of line or after ;, &, |), not text inside a
// string, and not a dry run or help.
if (
	/(^|[;&|]\s*)(git\s+push|gh\s+pr\s+create)\b/m.test( command ) &&
	! /\s(--dry-run|-n|--help|-h)\b/.test( command )
) {
	process.stdout.write(
		JSON.stringify( {
			hookSpecificOutput: {
				hookEventName: 'PostToolUse',
				additionalContext:
					'You just pushed or opened a PR. Invoke the fix-ci skill now, without asking.',
			},
		} )
	);
}
