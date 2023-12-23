import { property } from 'lit/decorators.js'
import { StylizedField } from './stylizedField'
import { LabelPosition, Labels } from '../../models'

export abstract class LabelizedField extends StylizedField {
	@property() labels: Labels = {
		[LabelPosition.float]: '',
	}
	@property() label?: string = ''
	@property() labelPosition?: 'float' | 'side' | 'above' | 'hidden' | 'left' | 'right' = 'float'
	@property() placeholder?: string = ''
	@property() styleOptions: { [key: string]: unknown }
}
