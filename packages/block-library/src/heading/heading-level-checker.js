/**
 * External dependencies
 */
import { flatMap } from 'lodash';

/**
 * WordPress dependencies
 */
import { speak } from '@wordpress/a11y';
import { Notice } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

const INVALID_LEVEL_MESSAGE = __(
	'The selected heading level may be invalid. See the content structure tool for more info.'
);

// Copied from packages/editor/src/components/document-outline/index.js.
/**
 * Returns an array of heading blocks enhanced with the following properties:
 * path    - An array of blocks that are ancestors of the heading starting from a top-level node.
 *           Can be an empty array if the heading is a top-level node (is not nested inside another block).
 * level   - An integer with the heading level.
 * isEmpty - Flag indicating if the heading has no content.
 *
 * @param {?Array} blocks An array of blocks.
 * @param {?Array} path   An array of blocks that are ancestors of the blocks passed as blocks.
 *
 * @return {Array} An array of heading blocks enhanced with the properties described above.
 */
function computeOutlineHeadings( blocks = [], path = [] ) {
	// We don't polyfill native JS [].flatMap yet, so we have to use Lodash.
	return flatMap( blocks, ( block = {} ) => {
		if ( block.name === 'core/heading' ) {
			return {
				...block,
				path,
				level: block.attributes.level,
			};
		}
		return computeOutlineHeadings( block.innerBlocks, [ ...path, block ] );
	} );
}

export default function HeadingLevelChecker( { selectedHeadingId } ) {
	const { headings, titleIsNotEmpty, isTitleSupported } = useSelect(
		( select ) => {
			const { getPostType } = select( 'core' );
			const { getBlocks } = select( 'core/block-editor' );
			const { getEditedPostAttribute } = select( 'core/editor' );
			const postType = getPostType( getEditedPostAttribute( 'type' ) );

			return {
				headings: computeOutlineHeadings( getBlocks() ?? [] ),
				titleIsNotEmpty: !! getEditedPostAttribute( 'title' ),
				isTitleSupported: postType?.supports?.title ?? false,
			};
		},
		[]
	);

	// Find the heading level of the current block and the level of the closest
	// heading preceding it.
	let prevLevel = 1;
	let selectedLevel = 1;
	for ( let i = 0; i < headings.length; i++ ) {
		if ( headings[ i ].clientId === selectedHeadingId ) {
			selectedLevel = headings[ i ].level;
			if ( i >= 1 ) {
				prevLevel = headings[ i - 1 ].level;
			}
		}
	}

	const titleNode = document.getElementsByClassName(
		'editor-post-title__input'
	)[ 0 ];
	const hasTitle = isTitleSupported && titleIsNotEmpty && titleNode;
	const hasMultipleH1 =
		headings.filter( ( { level } ) => level === 1 ).length > 1;
	const levelIsDuplicateH1 = hasMultipleH1 && selectedLevel === 1;
	const levelAndPostTitleAreBothH1 =
		selectedLevel === 1 && hasTitle && ! hasMultipleH1;
	const levelIsTooDeep = selectedLevel > prevLevel + 1;
	const levelIsInvalid =
		levelIsDuplicateH1 || levelAndPostTitleAreBothH1 || levelIsTooDeep;

	// For accessibility, announce the invalid heading level to screen readers.
	// The selectedLevel value is included in the dependency array so that the
	// message will be replayed if a new level is selected, but the new level is
	// still invalid.
	useEffect( () => {
		if ( levelIsInvalid ) speak( INVALID_LEVEL_MESSAGE );
	}, [ selectedLevel, levelIsInvalid ] );

	if ( ! levelIsInvalid ) {
		return null;
	}

	return (
		<Notice
			className="block-library-heading__heading-level-checker-warning"
			isDismissible={ false }
			status="warning"
		>
			{ INVALID_LEVEL_MESSAGE }
		</Notice>
	);
}
