// Demo-app entry point. Dynamically imports the theme chosen in localStorage
// and calls its registerTheme() *before* the demo-app module loads, because
// registering a theme calls customElements.define() and Custom Elements can
// only be registered once per tag name. Switching themes therefore requires a
// soft reload — the picker writes a new value to localStorage and calls
// location.reload().

const SUPPORTED_THEMES = ['default', 'icure-blue', 'kendo'] as const
const SUPPORTED_LANGUAGES = ['en', 'fr', 'nl'] as const
const SUPPORTED_INTERPRETERS = ['quickjs', 'insecure'] as const

export type DemoTheme = (typeof SUPPORTED_THEMES)[number]
export type DemoLanguage = (typeof SUPPORTED_LANGUAGES)[number]
export type DemoInterpreter = (typeof SUPPORTED_INTERPRETERS)[number]

export const DEFAULT_THEME: DemoTheme = 'icure-blue'
export const DEFAULT_LANGUAGE: DemoLanguage = 'en'
export const DEFAULT_INTERPRETER: DemoInterpreter = 'quickjs'

export const THEME_STORAGE_KEY = 'com.icure.demo.theme'
export const LANGUAGE_STORAGE_KEY = 'com.icure.demo.language'
export const INTERPRETER_STORAGE_KEY = 'com.icure.demo.interpreter'

export function getStoredTheme(): DemoTheme {
	const stored = localStorage.getItem(THEME_STORAGE_KEY) as DemoTheme | null
	return stored && (SUPPORTED_THEMES as readonly string[]).includes(stored) ? stored : DEFAULT_THEME
}

export function getStoredLanguage(): DemoLanguage {
	const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY) as DemoLanguage | null
	return stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored) ? stored : DEFAULT_LANGUAGE
}

export function getStoredInterpreter(): DemoInterpreter {
	const stored = localStorage.getItem(INTERPRETER_STORAGE_KEY) as DemoInterpreter | null
	return stored && (SUPPORTED_INTERPRETERS as readonly string[]).includes(stored) ? stored : DEFAULT_INTERPRETER
}

export function setStoredInterpreter(interpreter: DemoInterpreter): void {
	localStorage.setItem(INTERPRETER_STORAGE_KEY, interpreter)
}

export function setStoredTheme(theme: DemoTheme): void {
	localStorage.setItem(THEME_STORAGE_KEY, theme)
}

export function setStoredLanguage(language: DemoLanguage): void {
	localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
}

export { SUPPORTED_THEMES, SUPPORTED_LANGUAGES, SUPPORTED_INTERPRETERS }

const themeImporters: Record<DemoTheme, () => Promise<{ registerTheme: () => void }>> = {
	default: () => import(/* webpackChunkName: "theme-default" */ '../src/components/themes/default'),
	'icure-blue': () => import(/* webpackChunkName: "theme-icure-blue" */ '../src/components/themes/icure-blue'),
	kendo: () => import(/* webpackChunkName: "theme-kendo" */ '../src/components/themes/kendo'),
}

void (async () => {
	const { registerTheme } = await themeImporters[getStoredTheme()]()
	registerTheme()
	await import('./demo-app')
})()
