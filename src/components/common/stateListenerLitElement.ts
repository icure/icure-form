import { property, state } from 'lit/decorators.js'
import { StateToUpdate } from '../icure-form/model'
import { LitElement } from 'lit'
import { ActionManager } from '../../models'

export abstract class StateListenerLitElement extends LitElement {
	@property() actionManager?: ActionManager
	@property() editable = true
	@state() public display = true
	public stateUpdater(state: StateToUpdate, result: any): void {
		if (state === StateToUpdate.VISIBLE) {
			this.display = result
		}
	}

	public registerStateUpdater(name: string, stateUpdater?: (state: StateToUpdate, result: any) => void) {
		if (this.actionManager) {
			this.actionManager.registerStateUpdater(name || '', stateUpdater || this.stateUpdater.bind(this))
		}
	}
}
