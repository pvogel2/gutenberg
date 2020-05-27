/**
 * WordPress dependencies
 */
import { useSelect } from '@wordpress/data';
import { createHigherOrderComponent } from '@wordpress/compose';

/**
 * Internal dependencies
 */
import { useBlockEditContext } from '../block-edit/context';

export default createHigherOrderComponent(
	( Component ) => ( { children } ) => {
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

				return getMultiSelectedBlockClientIds().every(
					( id ) => getBlockName( id ) === name
				);
			},
			[ clientId, name ]
		);

		if ( ! isSelected && ! isFirstAndSameTypeMultiSelected ) {
			return null;
		}

		return <Component>{ children }</Component>;
	},
	'ifDisplayBlockControls'
);
