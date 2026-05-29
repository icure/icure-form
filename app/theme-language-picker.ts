import { css, html, LitElement } from 'lit'
import { DemoLanguage, DemoTheme, SUPPORTED_LANGUAGES, SUPPORTED_THEMES, getStoredLanguage, getStoredTheme, setStoredLanguage, setStoredTheme } from './bootstrap'

const THEME_LABELS: Record<DemoTheme, string> = {
	default: 'Default',
	'icure-blue': 'iCure blue',
	kendo: 'Kendo',
}

const LANGUAGE_LABELS: Record<DemoLanguage, string> = {
	en: 'English',
	fr: 'Français',
	nl: 'Nederlands',
}

export class ThemeLanguagePicker extends LitElement {
	static get styles() {
		return css`
			:host {
				display: flex;
				flex-direction: column;
				gap: 6px;
				padding: 8px;
				margin-bottom: 8px;
				background-color: #f5f7fa;
				border: 1px solid #dde3e7;
				border-radius: 2px;
				font-family: 'Roboto', Helvetica, sans-serif;
				font-size: 12px;
			}

			label {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 8px;
			}

			label span {
				color: #586069;
			}

			select {
				flex: 1;
				padding: 4px 6px;
				font: inherit;
				border: 1px solid #cad0d5;
				border-radius: 2px;
				background-color: #ffffff;
			}
		`
	}

	private onThemeChange(event: Event) {
		const value = (event.target as HTMLSelectElement).value as DemoTheme
		setStoredTheme(value)
		location.reload()
	}

	private onLanguageChange(event: Event) {
		const value = (event.target as HTMLSelectElement).value as DemoLanguage
		setStoredLanguage(value)
		location.reload()
	}

	render() {
		const theme = getStoredTheme()
		const language = getStoredLanguage()
		return html`
			<label>
				<span>Theme</span>
				<select @change="${this.onThemeChange}">
					${SUPPORTED_THEMES.map((t) => html`<option value="${t}" ?selected="${t === theme}">${THEME_LABELS[t]}</option>`)}
				</select>
			</label>
			<label>
				<span>Language</span>
				<select @change="${this.onLanguageChange}">
					${SUPPORTED_LANGUAGES.map((l) => html`<option value="${l}" ?selected="${l === language}">${LANGUAGE_LABELS[l]}</option>`)}
				</select>
			</label>
		`
	}
}

customElements.define('theme-language-picker', ThemeLanguagePicker)
