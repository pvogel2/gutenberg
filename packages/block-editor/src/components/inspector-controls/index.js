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

function InspectorControls( { allowMultiple, ...props } ) {
	const { isSelected, clientId } = useBlockEditContext();
	const isFirstMultiSelected = useSelect( ( select ) =>
		select( 'core/block-editor' ).isFirstMultiSelectedBlock( clientId )
	);

	if ( ! isSelected ) {
		if ( ! allowMultiple || ! isFirstMultiSelected ) {
			return null;
		}
	}

	return <Fill { ...props } />;
}

InspectorControls.Slot = Slot;

/**
 * @see https://github.com/WordPress/gutenberg/blob/master/packages/block-editor/src/components/inspector-controls/README.md
 */
export default InspectorControls;
