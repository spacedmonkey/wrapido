/**
 * Generates the other AI agents' plugin manifests from the Claude Code one.
 *
 * `.claude-plugin/plugin.json` is the single source of truth: GitHub Copilot
 * and Codex read it directly, and the files below are derived from it for
 * the tools that don't (Gemini CLI, Cursor) or that would otherwise prefer
 * their own stale copy (Codex's `.codex-plugin/`). Run with `--check` (CI)
 * to fail on drift instead of writing.
 *
 * Usage: node scripts/sync-agent-plugins.js [--check]
 */

/**
 * External dependencies
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const root = fileURLToPath( new URL( '..', import.meta.url ) );
const check = process.argv.includes( '--check' );
const LOGO = 'docs/assets/logo.svg';

/**
 * Reads and parses a JSON file relative to the repo root.
 * @param {string} path Repo-relative path.
 * @return {Object|undefined} The parsed JSON, or undefined when the file doesn't exist.
 */
function readJson( path ) {
	const file = join( root, path );
	return existsSync( file )
		? JSON.parse( readFileSync( file, 'utf8' ) )
		: undefined;
}

/**
 * Builds every generated manifest from the Claude Code one.
 * @param {Object} claude      The parsed `.claude-plugin/plugin.json`.
 * @param {Object} marketplace The parsed `.claude-plugin/marketplace.json`.
 * @return {Object<string, Object>} Generated manifests keyed by repo-relative path.
 */
function buildTargets( claude, marketplace ) {
	const { name, version, description } = claude;
	return {
		// Gemini CLI auto-discovers skills/. No contextFileName: Gemini would
		// load it into every session, while the skill loads only when relevant.
		'gemini-extension.json': { name, version, description },
		// Cursor ignores .claude-plugin/; paths are relative to the repo root.
		'.cursor-plugin/plugin.json': { ...claude, logo: LOGO },
		// Lets Cursor import the repo via Customize → From GitHub Repository.
		'.cursor-plugin/marketplace.json': marketplace,
		// Codex prefers this over .claude-plugin/, so it must never drift.
		'.codex-plugin/plugin.json': {
			...claude,
			skills: './skills/',
			interface: {
				displayName: name,
				shortDescription: description,
				developerName: claude.author.name,
				category: 'Developer Tools',
				capabilities: [ 'Interactive', 'Read', 'Write' ],
				websiteURL: claude.homepage,
				defaultPrompt: [
					'List the five most recent draft posts on my WordPress site.',
					'Create a draft post titled Hello World.',
					'Which custom post types and taxonomies does this site register?',
				],
				composerIcon: `./${ LOGO }`,
				logo: `./${ LOGO }`,
			},
		},
	};
}

/**
 * Reads a one-line YAML scalar from a frontmatter block, minus any quotes.
 * @param {string} head Frontmatter text, without the `---` fences.
 * @param {string} key  The key to read.
 * @return {string} The value, or an empty string when the key is missing.
 */
function scalar( head, key ) {
	const value =
		head.match( new RegExp( `^${ key }:\\s*(.*)$`, 'm' ) )?.[ 1 ].trim() ??
		'';
	return value.replace( /^(["'])(.*)\1$/, '$2' );
}

/**
 * Checks each skill's frontmatter against the agentskills.io spec every
 * supported tool follows (VS Code silently drops a skill that breaks it).
 * @return {string[]} Problems found, empty when every skill is valid.
 */
function skillProblems() {
	const problems = [];
	const dirs = readdirSync( join( root, 'skills' ), { withFileTypes: true } )
		.filter( ( entry ) => entry.isDirectory() )
		.map( ( entry ) => entry.name );
	for ( const dir of dirs ) {
		const path = `skills/${ dir }/SKILL.md`;
		const head =
			readFileSync( join( root, path ), 'utf8' )
				.replace( /\r\n/g, '\n' )
				.match( /^---\n([\s\S]*?)\n---/ )?.[ 1 ] ?? '';
		// Plain or quoted one-line scalars only; anything else fails closed.
		const name = scalar( head, 'name' );
		const desc = scalar( head, 'description' );
		if ( ! /^[a-z0-9]+(-[a-z0-9]+)*$/.test( name ) || name.length > 64 ) {
			problems.push( `${ path }: invalid name "${ name }"` );
		}
		if ( name !== dir ) {
			problems.push(
				`${ path }: name "${ name }" must equal "${ dir }"`
			);
		}
		if ( desc.length < 1 || desc.length > 1024 ) {
			problems.push(
				`${ path }: description must be 1-1024 chars (${ desc.length })`
			);
		}
	}
	return problems;
}

const claude = readJson( '.claude-plugin/plugin.json' );
const problems = skillProblems();
const pkgVersion = readJson( 'package.json' ).version;
if ( claude.version !== pkgVersion ) {
	problems.push(
		`.claude-plugin/plugin.json version ${ claude.version } must equal package.json ${ pkgVersion }`
	);
}

for ( const [ path, manifest ] of Object.entries(
	buildTargets( claude, readJson( '.claude-plugin/marketplace.json' ) )
) ) {
	// Compare parsed JSON so `npm run format` reflowing a file isn't drift.
	if ( isDeepStrictEqual( readJson( path ), manifest ) ) {
		continue;
	}
	if ( check ) {
		problems.push( `${ path } is out of date` );
		continue;
	}
	mkdirSync( dirname( join( root, path ) ), { recursive: true } );
	writeFileSync(
		join( root, path ),
		JSON.stringify( manifest, null, '\t' ) + '\n'
	);
	process.stdout.write( `wrote ${ path }\n` );
}

if ( problems.length ) {
	process.stderr.write(
		problems.map( ( p ) => `error: ${ p }\n` ).join( '' )
	);
	if ( check ) {
		process.stderr.write(
			'Fix the errors above; regenerate stale files with `npm run sync:plugins`.\n'
		);
	}
	process.exit( 1 );
}
