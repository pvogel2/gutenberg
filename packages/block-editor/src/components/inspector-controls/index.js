/**
 * WordPress dependencies
 */
import { createSlotFill } from '@wordpress/components';

/**
 * Internal dependencies
 */
import ifDisplayBlockControls from '../if-display-block-controls';

const { Fill, Slot } = createSlotFill( 'InspectorControls' );
const InspectorControls = ifDisplayBlockControls( Fill );

InspectorControls.Slot = Slot;

/**
 * @see https://github.com/WordPress/gutenberg/blob/master/packages/block-editor/src/components/inspector-controls/README.md
 */
export default InspectorControls;
