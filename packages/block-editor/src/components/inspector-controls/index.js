/**
 * WordPress dependencies
 */
import { createSlotFill } from '@wordpress/components';
import { useSelect } from '@wordpress/data';

/**
 * Internal dependencies
 */
import { useBlockEditContext } from '../block-edit/context';

const { Fill, Slot } = createSlotFill( 'InspectorControls' );

function InspectorControls( { __experimentalAllowAnyMultiple, children } ) {
	const { isSelected, clientId, name } = useBlockEditContext();
	const isFirstAndSameTypeMultiSelected = useSelect(
		( select ) => {
			const {
				getBlockName,
				isFirstMultiSelectedBlock,
				getMultiSelectedBlockClientIds,
			} = select( 'core/block-editor' );

			if ( ! isFirstMultiSelectedBlock( clientId ) ) {
				return false;
			}

			return (
				__experimentalAllowAnyMultiple ||
				getMultiSelectedBlockClientIds().every(
					( id ) => getBlockName( id ) === name
				)
			);
		},
		[ __experimentalAllowAnyMultiple ]
	);

	if ( ! isSelected && ! isFirstAndSameTypeMultiSelected ) {
		return null;
	}

	return <Fill>{ children }</Fill>;
}

InspectorControls.Slot = Slot;

/**
 * @see https://github.com/WordPress/gutenberg/blob/master/packages/block-editor/src/components/inspector-controls/README.md
 */
export default InspectorControls;
