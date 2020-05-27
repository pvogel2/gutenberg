/**
 * WordPress dependencies
 */
import { useSelect } from '@wordpress/data';

/**
 * Internal dependencies
 */
import { useBlockEditContext } from '../block-edit/context';

export default function ifDisplayBlockControls( Component ) {
	return ( { children } ) => {
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
	};
}
