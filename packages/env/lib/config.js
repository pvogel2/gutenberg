'use strict';
/**
 * External dependencies
 */
const fs = require( 'fs' ).promises;
const path = require( 'path' );
const os = require( 'os' );
const crypto = require( 'crypto' );

/**
 * Internal dependencies
 */
const detectDirectoryType = require( './detect-directory-type' );

/**
 * Error subtype which indicates that an expected validation erorr occured
 * while reading wp-env configuration.
 */
class ValidationError extends Error {}

/**
 * The string at the beginning of a source path that points to a home-relative
 * directory. Will be '~/' on unix environments and '~\' on Windows.
 */
const HOME_PATH_PREFIX = `~${ path.sep }`;

/**
 * Extra options on top of WPServiceConfig available for Config
 *
 * @typedef Config
 * @property {string}      name                     Name of the environment.
 * @property {string}      configDirectoryPath      Path to the .wp-env.json file.
 * @property {string}      workDirectoryPath        Path to the work directory located in ~/.wp-env.
 * @property {string}      dockerComposeConfigPath  Path to the docker-compose.yml file.
 * @property {Object.<string, WPServiceConfig>} env Specific config for different services.
 * @property {boolean}     debug                    True if debug mode is enabled.
 *
 * Pretend that the following types are "extended" from WPServiceConfig in a
 * world where JSDoc supports intersection or inheritance.
 * @property {Source|null} coreSource           The WordPress installation to load in the environment.
 * @property {Source[]}    pluginSources        Plugins to load in the environment.
 * @property {Source[]}    themeSources         Themes to load in the environment.
 * @property {number}      port                 The port on which to start the development WordPress environment.
 * @property {Object}      config               Mapping of wp-config.php constants to their desired values.
 * @property {Object.<string, Source>} mappings Mapping of WordPress directories to local directories which should be mounted.
 */

/**
 * Base-level config for any particular service.
 *
 * @typedef WPServiceConfig
 * @property {Source|null} coreSource           The WordPress installation to load in the environment.
 * @property {Source[]}    pluginSources        Plugins to load in the environment.
 * @property {Source[]}    themeSources         Themes to load in the environment.
 * @property {number}      port                 The port on which to start the development WordPress environment.
 * @property {Object}      config               Mapping of wp-config.php constants to their desired values.
 * @property {Object.<string, Source>} mappings Mapping of WordPress directories to local directories which should be mounted.
 */

/**
 * A WordPress installation, plugin or theme to be loaded into the environment.
 *
 * @typedef Source
 * @property {string} type The source type. Can be 'local' or 'git'.
 * @property {string} path The path to the WordPress installation, plugin or theme.
 * @property {string} basename Name that identifies the WordPress installation, plugin or theme.
 */

module.exports = {
	ValidationError,

	/**
	 * Reads and parses the given .wp-env.json file into a wp-env config object.
	 *
	 * @param {string} configPath Path to the .wp-env.json file.
	 * @return {Config} A wp-env config object.
	 */
	async readConfig( configPath ) {
		const configDirectoryPath = path.dirname( configPath );
		const workDirectoryPath = path.resolve(
			getHomeDirectory(),
			md5( configPath )
		);

		// The default WPServiceConfig set for every environment.
		const defaultEnvConfig = {
			core: null,
			plugins: [],
			themes: [],
			port: 8888,
			config: {
				WP_DEBUG: true,
				SCRIPT_DEBUG: true,
				WP_TESTS_DOMAIN: 'localhost',
			},
			mappings: {},
		};

		// Default configuration format which can be changed.
		const defaultConfig = {
			...defaultEnvConfig,
			env: {
				development: {
					port: 8888,
				},
				tests: {
					config: { WP_DEBUG: false, SCRIPT_DEBUG: false },
					port: 8889,
				},
			},
		};

		// The specified configuration from .wp-env.json or from detecting the source type in cwd.
		const baseConfig =
			( await getConfigFileData( '.wp-env.json', configPath ) ) ||
			getDefaultBaseConfig();

		// Configuration to override on a per-user case.
		const overrideConfig =
			( await getConfigFileData(
				'.wp-env.override.json',
				configPath.replace( /\.wp-env\.json$/, '.wp-env.override.json' )
			) ) || {};

		// Base-level parsed configuration applicable to all environments with
		// overrides applied in order.
		const configAll = parseConfig(
			{
				...defaultEnvConfig,
				...baseConfig,
				...overrideConfig,
			},
			workDirectoryPath
		);

		// A unique array of the environments specified in the config options.
		// Needed so that we can override items on a per-environment level, rather
		// than completely overwriting each env.
		const getEnvKeys = ( config ) => Object.keys( config.env || {} );
		const allEnvs = [
			...new Set( [
				...getEnvKeys( defaultConfig ),
				...getEnvKeys( baseConfig ),
				...getEnvKeys( overrideConfig ),
			] ),
		];

		const getEnvConfig = ( config, envName ) =>
			config.env && config.env[ envName ] ? config.env[ envName ] : {};

		const env = allEnvs.reduce( ( result, envName ) => {
			result[ envName ] = parseConfig(
				{
					...defaultEnvConfig,
					...getEnvConfig( defaultConfig, envName ),
					...getEnvConfig( baseConfig, envName ),
					...getEnvConfig( overrideConfig, envName ),
				},
				workDirectoryPath
			);
			return result;
		}, {} );

		return withOverrides( {
			name: path.basename( configDirectoryPath ),
			dockerComposeConfigPath: path.resolve(
				workDirectoryPath,
				'docker-compose.yml'
			),
			configDirectoryPath,
			workDirectoryPath,
			...configAll,
			env,
		} );
	},
};

async function getDefaultBaseConfig( configPath ) {
	const configDirectoryPath = path.dirname( configPath );
	const type = await detectDirectoryType( configDirectoryPath );

	if ( type === 'core' ) {
		return { core: '.' };
	} else if ( type === 'plugin' ) {
		return { plugins: [ '.' ] };
	} else if ( type === 'theme' ) {
		return { themes: [ '.' ] };
	}

	throw new ValidationError(
		`No .wp-env.json file found at '${ configPath }' and could not determine if '${ configDirectoryPath }' is a WordPress installation, a plugin, or a theme.`
	);
}

async function getConfigFileData( name, configPath ) {
	try {
		return withBackCompat(
			JSON.parse( await fs.readFile( configPath, 'utf8' ) )
		);
	} catch ( error ) {
		if ( error.code === 'ENOENT' ) {
			return null;
		} else if ( error instanceof SyntaxError ) {
			throw new ValidationError(
				`Invalid ${ name }: ${ error.message }`
			);
		} else {
			throw new ValidationError(
				`Could not read ${ name }: ${ error.message }`
			);
		}
	}
}

/**
 * Used to maintain back compatibility with older versions of the .wp-env.json
 * file. Returns an object in the shape of the currently expected .wp-env.json
 * version.
 *
 * @param {Object} rawConfig config right after being read from a file.
 */
function withBackCompat( rawConfig ) {
	// Convert testsPort into new env.tests format.
	if ( rawConfig.testsPort ) {
		rawConfig.env = {
			...( rawConfig.env || {} ),
			tests: {
				...( rawConfig.env && rawConfig.env.tests
					? rawConfig.env.tests
					: {} ),
				port: rawConfig.testsPort,
			},
		};
	}
	return rawConfig;
}

/**
 * Overrides keys in the config object with set environment variables or options
 * which should be merged.
 *
 * @param {Config} config fully parsed configuration object.
 * @return {Config} configuration object with overrides applied.
 */
function withOverrides( config ) {
	// Override port numbers with environment variables.
	config.env.development.port =
		getNumberFromEnvVariable( 'WP_ENV_PORT' ) ||
		config.env.development.port;
	config.env.tests.port =
		getNumberFromEnvVariable( 'WP_ENV_TESTS_PORT' ) ||
		config.env.tests.port;

	// Set the WP_TESTS_DOMAIN port number based on the passed port.
	const devUrl = new URL( config.env.development.config.WP_TESTS_DOMAIN );
	devUrl.port = config.env.development.port;
	config.env.development.config.WP_TESTS_DOMAIN = devUrl.toString();

	const testsUrl = new URL( config.env.tests.config.WP_TESTS_DOMAIN );
	testsUrl.port = config.env.tests.port;
	config.env.tests.config.WP_TESTS_DOMAIN = testsUrl.toString();

	return config;
}

/**
 * Parses and validates a config object.
 *
 * @param {Object} config A raw config object to parse
 * @param {string} workDirectoryPath Absolute path to the environment work dir.
 * @return {Object} the validated and parsed config object.
 */
function parseConfig( config, workDirectoryPath ) {
	if ( config.core !== null && typeof config.core !== 'string' ) {
		throw new ValidationError(
			'Invalid .wp-env.json: "core" must be null or a string.'
		);
	}

	if (
		! Array.isArray( config.plugins ) ||
		config.plugins.some( ( plugin ) => typeof plugin !== 'string' )
	) {
		throw new ValidationError(
			'Invalid .wp-env.json: "plugins" must be an array of strings.'
		);
	}

	if (
		! Array.isArray( config.themes ) ||
		config.themes.some( ( theme ) => typeof theme !== 'string' )
	) {
		throw new ValidationError(
			'Invalid .wp-env.json: "themes" must be an array of strings.'
		);
	}

	if ( ! Number.isInteger( config.port ) ) {
		throw new ValidationError(
			'Invalid .wp-env.json: "port" must be an integer.'
		);
	}

	if ( typeof config.config !== 'object' ) {
		throw new ValidationError(
			'Invalid .wp-env.json: "config" must be an object.'
		);
	}

	if ( typeof config.mappings !== 'object' ) {
		throw new ValidationError(
			'Invalid .wp-env.json: "mappings" must be an object.'
		);
	}

	for ( const [ wpDir, localDir ] of Object.entries( config.mappings ) ) {
		if ( ! localDir || typeof localDir !== 'string' ) {
			throw new ValidationError(
				`Invalid .wp-env.json: "mapping.${ wpDir }" should be a string.`
			);
		}
	}

	return {
		port: config.port,
		coreSource: includeTestsPath(
			parseSourceString( config.core, {
				workDirectoryPath,
			} ),
			{ workDirectoryPath }
		),
		pluginSources: config.plugins.map( ( sourceString ) =>
			parseSourceString( sourceString, {
				workDirectoryPath,
			} )
		),
		themeSources: config.themes.map( ( sourceString ) =>
			parseSourceString( sourceString, {
				workDirectoryPath,
			} )
		),
		config: config.config,
		mappings: Object.entries( config.mappings ).reduce(
			( result, [ wpDir, localDir ] ) => {
				const source = parseSourceString( localDir, {
					workDirectoryPath,
				} );
				result[ wpDir ] = source;
				return result;
			},
			{}
		),
	};
}

/**
 * Parses a source string into a source object.
 *
 * @param {string|null} sourceString The source string. See README.md for documentation on valid source string patterns.
 * @param {Object} options
 * @param {boolean} options.hasTests Whether or not a `testsPath` is required. Only the 'core' source needs this.
 * @param {string} options.workDirectoryPath Path to the work directory located in ~/.wp-env.
 * @return {Source|null} A source object.
 */
function parseSourceString( sourceString, { workDirectoryPath } ) {
	if ( sourceString === null ) {
		return null;
	}

	if (
		sourceString.startsWith( '.' ) ||
		sourceString.startsWith( HOME_PATH_PREFIX ) ||
		path.isAbsolute( sourceString )
	) {
		let sourcePath;
		if ( sourceString.startsWith( HOME_PATH_PREFIX ) ) {
			sourcePath = path.resolve(
				os.homedir(),
				sourceString.slice( HOME_PATH_PREFIX.length )
			);
		} else {
			sourcePath = path.resolve( sourceString );
		}
		const basename = path.basename( sourcePath );
		return {
			type: 'local',
			path: sourcePath,
			basename,
		};
	}

	const zipFields = sourceString.match(
		/^https?:\/\/([^\s$.?#].[^\s]*)\.zip$/
	);

	if ( zipFields ) {
		const wpOrgFields = sourceString.match(
			/^https?:\/\/downloads\.wordpress\.org\/(?:plugin|theme)\/([^\s\.]*)([^\s]*)?\.zip$/
		);
		const basename = wpOrgFields
			? encodeURIComponent( wpOrgFields[ 1 ] )
			: encodeURIComponent( zipFields[ 1 ] );
		return {
			type: 'zip',
			url: sourceString,
			path: path.resolve( workDirectoryPath, basename ),
			basename,
		};
	}

	const gitHubFields = sourceString.match( /^([^\/]+)\/([^#]+)(?:#(.+))?$/ );
	if ( gitHubFields ) {
		return {
			type: 'git',
			url: `https://github.com/${ gitHubFields[ 1 ] }/${ gitHubFields[ 2 ] }.git`,
			ref: gitHubFields[ 3 ] || 'master',
			path: path.resolve( workDirectoryPath, gitHubFields[ 2 ] ),
			basename: gitHubFields[ 2 ],
		};
	}

	throw new ValidationError(
		`Invalid or unrecognized source: "${ sourceString }."`
	);
}

/**
 * Given a source object, returns a new source object with the testsPath
 * property set correctly. Only the 'core' source requires a testsPath.
 *
 * @param {Source|null} source A source object.
 * @param {Object} options
 * @param {string} options.workDirectoryPath Path to the work directory located in ~/.wp-env.
 * @return {Source|null} A source object.
 */
function includeTestsPath( source, { workDirectoryPath } ) {
	if ( source === null ) {
		return null;
	}

	return {
		...source,
		testsPath: path.resolve(
			workDirectoryPath,
			'tests-' + path.basename( source.path )
		),
	};
}

/**
 * Parses an environment variable which should be a number.
 *
 * Throws an error if the variable cannot be parsed to a number.
 * Returns null if the environment variable has not been specified.
 *
 * @param {string} varName The environment variable to check (e.g. WP_ENV_PORT).
 * @return {null|number} The number. Null if it does not exist.
 */
function getNumberFromEnvVariable( varName ) {
	// Allow use of the default if it does not exist.
	if ( ! process.env[ varName ] ) {
		return null;
	}

	const maybeNumber = parseInt( process.env[ varName ] );

	// Throw an error if it is not parseable as a number.
	if ( isNaN( maybeNumber ) ) {
		throw new ValidationError(
			`Invalid environment variable: ${ varName } must be a number.`
		);
	}

	return maybeNumber;
}

/**
 * Gets the `wp-env` home directory in which generated files are created.
 *
 * By default, '~/.wp-env/'. On Linux, '~/wp-env/'. Can be overriden with the
 * WP_ENV_HOME environment variable.
 *
 * @return {string} The absolute path to the `wp-env` home directory.
 */
function getHomeDirectory() {
	// Allow user to override download location.
	if ( process.env.WP_ENV_HOME ) {
		return path.resolve( process.env.WP_ENV_HOME );
	}

	/**
	 * Installing docker with Snap Packages on Linux is common, but does not
	 * support hidden directories. Therefore we use a public directory on Linux.
	 *
	 * @see https://github.com/WordPress/gutenberg/issues/20180#issuecomment-587046325
	 */
	return path.resolve(
		os.homedir(),
		os.platform() === 'linux' ? 'wp-env' : '.wp-env'
	);
}

/**
 * Hashes the given string using the MD5 algorithm.
 *
 * @param {string} data The string to hash.
 * @return {string} An MD5 hash string.
 */
function md5( data ) {
	return crypto
		.createHash( 'md5' )
		.update( data )
		.digest( 'hex' );
}
