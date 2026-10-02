/** @type {import('jest').Config} */
export default {
	testEnvironment: 'node',
	roots: [ '<rootDir>/test/unit' ],
	testMatch: [ '**/*.test.ts' ],
	extensionsToTreatAsEsm: [ '.ts' ],
	injectGlobals: false,
	setupFiles: [ '<rootDir>/test/unit/setup-agent-env.ts' ],
	setupFilesAfterEnv: [ '<rootDir>/test/unit/setup-config-dir.ts' ],
	moduleFileExtensions: [ 'ts', 'js', 'json', 'node' ],
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1',
	},
	transform: {
		'^.+\\.tsx?$': [
			'ts-jest',
			{
				useESM: true,
			},
		],
	},
};
