import { CSSResultGroup, LitElement } from 'lit'

export type ThemeStyleOverride = CSSResultGroup
export type ThemeOverrides = Record<string, ThemeStyleOverride>

export interface RegisterThemeOptions {
	overrides?: ThemeOverrides
}

export type RegisterTheme = (options?: RegisterThemeOptions) => void

type ThemableClass = typeof LitElement & { styles?: CSSResultGroup }

export interface ThemeEntry {
	tag: string
	baseClass: ThemableClass
	themeCss?: CSSResultGroup
}

function toStyleArray(value: CSSResultGroup | undefined): CSSResultGroup[] {
	if (value === undefined) return []
	return Array.isArray(value) ? (value as CSSResultGroup[]) : [value]
}

export function buildThemeRegistrar(entries: ThemeEntry[]): RegisterTheme {
	return (options) => {
		const overrides = options?.overrides ?? {}
		for (const { tag, baseClass, themeCss } of entries) {
			const overrideCss = overrides[tag]
			const ElementClass =
				themeCss !== undefined || overrideCss !== undefined
					? class extends baseClass {
							static get styles(): CSSResultGroup {
								return [...toStyleArray(baseClass.styles), ...(themeCss ? [themeCss] : []), ...(overrideCss ? [overrideCss] : [])]
							}
					  }
					: baseClass
			customElements.define(tag, ElementClass)
		}
	}
}
