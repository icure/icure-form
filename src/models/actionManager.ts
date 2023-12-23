import { Action, Trigger, Form, StateToUpdate, Group, Field, Section, Launcher } from '../components/iqr-form/model'
import { FormValuesContainer } from './formValuesContainer'

export function extractActions(actions: Action[], name: string, trigger?: Trigger): Action[] {
	return actions.filter((action) => action.launchers.some((launcher: Launcher) => launcher.name === name && (!trigger || launcher.triggerer === trigger)))
}
export function extractActionsByTrigger(actions: Action[], trigger: Trigger): Action[] {
	return actions.filter((action) => action.launchers.some((launcher: Launcher) => launcher.triggerer === trigger))
}

export function extractLauncherByNameAndTrigger(actions: Action, name: string, trigger: Trigger): Launcher | undefined {
	return actions.launchers.find((launcher: Launcher) => launcher.name === name && launcher.triggerer === trigger)
}
export class ActionManager {
	public actions: Action[] = []
	formValuesContainer: FormValuesContainer
	stateUpdaters: { [name: string]: (state: StateToUpdate, result: any) => void } = {}
	readyChildrenCount: Map<string, { total: number; count: number; parent: string }> = new Map()
	defaultSandbox: Map<string, any> = new Map()
	public editable = true

	constructor(form: Form, formValueContainer: FormValuesContainer, editable = true) {
		this.editable = editable
		this.formValuesContainer = formValueContainer
		this.actions = form.actions || []
		this.readyChildrenCount.set(form.form || 'main', { total: (form.sections || []).length, count: 0, parent: '' })
		form.sections.forEach((section: Section) => {
			this.readyChildrenCount = this.getTotalChildrenCount(section, this.readyChildrenCount, form.form || 'main')
		})
	}
	private getTotalChildrenCount(
		sg: Section | Group | Field,
		childrenCount: Map<string, { total: number; count: number; parent: string }>,
		parentName: string,
	): Map<string, { total: number; count: number; parent: string }> {
		let name = ''
		if (sg instanceof Section) {
			name = sg.section || ''
		} else if (sg instanceof Group) {
			name = sg.group || ''
		} else {
			name = sg.field || ''
			this.defaultSandbox.set(name, { value: sg.value })
			childrenCount.set(name, { total: 0, count: 0, parent: parentName })
			return childrenCount
		}
		childrenCount.set(name, { total: (sg.fields || []).length, count: 0, parent: parentName })
		;(sg.fields || []).forEach((field) => {
			childrenCount = this.getTotalChildrenCount(field, childrenCount, name)
		})
		return childrenCount
	}

	public registerStateUpdater(name: string, updater: (state: StateToUpdate, result: any) => void) {
		this.stateUpdaters[name] = updater
		this.childrenReady(name)
	}
	private childrenReady(name: string) {
		const parentName = this.readyChildrenCount.get(name)?.parent
		if (parentName) {
			const parent = this.readyChildrenCount.get(parentName)
			const count = parent?.count || 0
			const total = parent?.total || 0
			this.readyChildrenCount.set(parentName, { total, count: count + 1, parent: parent?.parent || '' })
			if (count + 1 === total) {
				this.childrenReady(parentName)
			}
		} else if (this.allReady()) {
			this.launchInitActions()
		}
	}

	private allReady(): boolean {
		return Array.from(this.readyChildrenCount.values()).every((count) => count.count === count.total)
	}
	private async launchInitActions() {
		if (this.formValuesContainer && this.actions) {
			for (const action of extractActionsByTrigger(this.actions || [], Trigger.INIT)) {
				let sandbox: any = { value: null }
				action.launchers.forEach((launcher: Launcher) => {
					if (launcher.triggerer === Trigger.INIT && launcher.shouldPassValue) {
						sandbox = this.defaultSandbox.get(launcher.name)
						if (!sandbox.codes) sandbox.codes = []
						if (!sandbox.content) sandbox.content = null
						if (!sandbox.fuzzyDateValue) sandbox.fuzzyDateValue = null
						if (!sandbox.options) sandbox.options = []
						if (!sandbox.id) sandbox.id = null
						if (!sandbox.value) sandbox.value = null
					}
				})
				const result = await this.formValuesContainer?.compute(action.expression, sandbox)
				if (result !== undefined) {
					action.states.forEach((state) => {
						this.stateUpdaters[state.name]?.(state.stateToUpdate, result)
					})
				}
			}
		}
	}

	public async launchActions(trigger: Trigger, name: string, sandbox?: any) {
		if (this.formValuesContainer && this.actions && this.editable) {
			for (const action of extractActions(this.actions || [], name, trigger)) {
				const launcher = extractLauncherByNameAndTrigger(action, name, trigger)
				const result = await this.formValuesContainer?.compute(action.expression, launcher?.shouldPassValue ? sandbox || {} : {})
				if (result !== undefined) {
					action.states.forEach((state) => {
						this.stateUpdaters[state.name]?.(state.stateToUpdate, result)
					})
				}
			}
		}
	}

	public hasActionsToLaunch(trigger: Trigger, name: string): boolean {
		return extractActions(this.actions || [], name, trigger).length > 0
	}
}
