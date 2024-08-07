import { html, LitElement } from 'lit'
import { property, state } from 'lit/decorators.js'
import { FieldMetadata, FieldValue } from '../model'
import { Suggestion, Version } from '../../generic'
import { calendarPatientPicto, i18nPicto, ownerPicto, searchPicto, versionPicto } from './styles/paths'
import { format } from 'date-fns'
import { anyDateToDate } from '../../utils/dates'
import { toResolvedDate } from 'app-datepicker/dist/helpers/to-resolved-date'
import { CustomEventDetail } from 'app-datepicker/dist/typings'
import { MAX_DATE } from 'app-datepicker/dist/constants'
import { languageName } from '../../utils/languages'

// @ts-ignore
import baseCss from '../common/styles/style.scss'

export class MetadataButtonBar extends LitElement {
	@property() valueId: string
	@property() metadata: FieldMetadata
	@property() revision: string
	@property() versions: Version<FieldValue>[]
	@property() defaultLanguage: string
	@property() selectedLanguage?: string
	@property() languages: { [iso: string]: string } = {}
	@property() existingLanguages?:  string[]
	@property() displayedLabels: { [iso: string]: string } = {}
	@property() handleMetadataChanged?: (metadata: FieldMetadata, id?: string) => string | undefined = undefined
	@property() handleLanguageSelected?: (iso?: string) => void = undefined
	@property() handleRevisionSelected?: (rev?: string | null) => void = undefined
	@property() ownersProvider: (terms: string[], ids?: string[], specialties?: string[]) => Promise<Suggestion[]> = async () => []

	@state() protected displayOwnersMenu = false
	@state() protected ownerInputValue = ''
	@state() protected availableOwners: Suggestion[] = []
	@state() protected loadedOwners: { [id: string]: Suggestion } = {}

	@state() protected displayLanguagesMenu = false
	@state() protected displayVersionsMenu = false
	@state() protected displayValueDateMenu = false
	@state() protected languageInputValue = ''

	static get styles() {
		return [baseCss]
	}

	_handleClickOutside(event: MouseEvent): void {
		if (!event.composedPath().includes(this)) {
			this.displayVersionsMenu = false
			this.displayLanguagesMenu = false
			this.displayOwnersMenu = false
			this.displayValueDateMenu = false
			event.stopPropagation()
		}
	}

	connectedCallback() {
		super.connectedCallback()
		document.addEventListener('click', this._handleClickOutside.bind(this))
	}

	disconnectedCallback() {
		super.disconnectedCallback()
		document.removeEventListener('click', this._handleClickOutside.bind(this))
	}

	render() {
		const revisionDate = this.versions.find((x) => x.revision === this.revision)?.modified

		const owner = this.metadata?.owner
		if (owner && !this.loadedOwners[owner]) {
			this.loadedOwners = { ...this.loadedOwners, [owner]: { id: owner, text: '', terms: [], label: {} } } // Make sure we do not loop endlessly
			this.ownersProvider &&
				this.ownersProvider([], [owner]).then((availableOwners) => (this.loadedOwners = availableOwners.reduce((acc, o) => ({ ...acc, [o.id]: o }), this.loadedOwners)))
		}

		const forcedByMenu = this.displayOwnersMenu || this.displayLanguagesMenu || this.displayValueDateMenu || this.displayVersionsMenu

		const discordantMetadata = this.metadata?.discordantMetadata?.()

		const forcedByOwner = discordantMetadata?.owner !== undefined
		const forcedByValueDate = discordantMetadata?.valueDate !== undefined
		const forcedByLanguage = this.selectedLanguage && this.defaultLanguage !== this.selectedLanguage
		const forcedByVersion = this.revision && this.revision !== this.versions?.[0]?.revision

		return html` <div id="extra" class=${'extra extra--metadataButtonsBar' + (forcedByMenu ? ' forced' : '')}>
			<div class="info ${forcedByOwner || forcedByLanguage || forcedByValueDate ? 'hidden' : ''}">&#9432</div>
			<div class="buttons-container">
				<div class="menu-container">
					<button
						data-content="${(this.metadata?.owner ? this.loadedOwners[this.metadata?.owner]?.text : '') ?? ''}"
						@click="${() => this.toggleOwnersMenu(this.metadata?.owner)}"
						class="btn menu-trigger author ${forcedByOwner ? 'forced' : ''}"
					>
						${ownerPicto}
					</button>
					${this.displayOwnersMenu
						? html`
								<div id="menu" class="menu">
									<div class="input-container">${searchPicto} <input id="ownerSearch" @input="${this.searchOwner}" /></div>
									${(this.availableOwners?.length ? this.availableOwners : Object.values(this.loadedOwners))?.map(
										(x) => html`
											<button 
												@click="${() => this.handleOwnerButtonClicked(x.id)}" 
												id="${x.id}"
												class="${
													(this.metadata?.owner && this.loadedOwners[this.metadata?.owner]?.text === x.text)
														? "item selected"
														: 'item'
												}"
											>
												${x.text}
											</button>`,
									)}
								</div>
						  `
						: ''}
				</div>
				<div class="menu-container">
					<button
						data-content="${this.metadata?.valueDate ? format(anyDateToDate(this.metadata.valueDate)!, 'yyyy-MM-dd HH:mm:ss').replace(/ 00:00:00$/, '') : ''}"
						class="btn date ${forcedByValueDate ? 'forced' : ''}"
						@click="${() => this.toggleValueDateMenu()}"
					>
						${calendarPatientPicto}
					</button>
					${this.displayValueDateMenu
						? html`
								<div id="menu" class="menu value-date-menu">
									<app-date-picker
										locale="${this.defaultLanguage ?? 'en'}"
										style=""
										max="${MAX_DATE}"
										min="${toResolvedDate('1900-01-01')}"
										@date-updated="${this.dateUpdated}"
									></app-date-picker>
								</div>
						  `
						: ''}
				</div>
				<div class="menu-container">
					<button
						data-content="${this.revision === null
							? 'latest'
							: this.revision
							? `rev-${this.revision.split('-')[0]} ${revisionDate ? `(${format(new Date(revisionDate), 'yyyy-MM-dd')})` : ''}`
							: ''}"
						@click="${this.toggleVersionsMenu}"
						class="btn version  ${forcedByVersion ? 'forced' : ''}"
					>
						${versionPicto}
					</button>
					${this.displayVersionsMenu
						? html` <div id="menu" class="menu">
								${this.versions.map(
									(x) =>
										html`
											<button 
												class="item ${x.revision === this.revision ? 'item selected' : ''}" 
												@click="${() => this.handleRevisionButtonClicked(x.revision)}">
											${x.revision == null ? 'Latest' : x.revision ?? ''} ${x.modified ? `(${format(new Date(x.modified), 'yyyy-MM-dd')})` : ''}
										</button>`,
								)}
						  </div>`
						: ''}
				</div>
				<div class="menu-container">
					<button
						data-content="${this.selectedLanguage ? languageName(this.selectedLanguage) ?? this.selectedLanguage : languageName(this.defaultLanguage) ?? this.defaultLanguage}"
						@click="${this.toggleLanguagesMenu}"
						class="btn menu-trigger language ${forcedByLanguage ? 'forced' : ''}"
					>
						${i18nPicto}
					</button>
					${this.displayLanguagesMenu
						? html`
								<div id="menu" class="menu">
									<div class="input-container">${searchPicto} <input id="languageSearch" @input="${this.searchLanguage}" /></div>
									${[this.defaultLanguage, ...Object.keys(this.languages).filter((x) => x !== this.defaultLanguage)]
										.filter((x) => !!x && (languageName(x) ?? this.languages[x] ?? x).toLowerCase().includes((this.languageInputValue ?? '').toLowerCase()))
										.map((x) => html`
											<button 
												@click="${() => this.handleLanguageButtonClicked(x)}" 
												id="${x}" 
												class="${
													(x === this.defaultLanguage && !this.selectedLanguage) || x === this.selectedLanguage 
													? "item item selected" 
													: this.existingLanguages?.includes(x) 
													? "item item existing" 
													: 'item'
												}"
											>
												${x ? languageName(x) : ''}
											</button>`)}
								</div>
						  `
						: ''}
				</div>
			</div>
		</div>`
	}

	toggleOwnersMenu(ownerId?: string) {
		this.displayOwnersMenu = !this.displayOwnersMenu
		if (this.displayOwnersMenu) {
			this.displayLanguagesMenu = false
			this.displayVersionsMenu = false
			this.displayValueDateMenu = false

			setTimeout(() => {
				;(this.renderRoot.querySelector('#ownerSearch') as HTMLInputElement)?.focus()
			}, 0)
		}
	}

	searchOwner(e: InputEvent) {
		const text = (e.target as HTMLInputElement).value
		setTimeout(async () => {
			if ((this.renderRoot.querySelector('#ownerSearch') as HTMLInputElement)?.value === text) {
				if (this.ownersProvider) {
					const availableOwners = await this.ownersProvider(text.split(' '))
					console.log(availableOwners)
					this.availableOwners = availableOwners
				}
			}
		}, 300)
	}

	searchLanguage(e: InputEvent) {
		this.languageInputValue = (e.target as HTMLInputElement).value
	}

	handleOwnerButtonClicked(id: string) {
		const valueId = this.valueId
		this.handleMetadataChanged && valueId && this.handleMetadataChanged({ label: this.metadata.label, owner: id })
		this.displayOwnersMenu = false
	}

	handleLanguageButtonClicked(id: string) {
		this.handleLanguageSelected?.(id)
		this.displayOwnersMenu = false
	}

	handleRevisionButtonClicked(rev?: string | null) {
		this.handleRevisionSelected?.(rev)
		this.displayVersionsMenu = false
	}

	toggleValueDateMenu() {
		this.displayValueDateMenu = !this.displayValueDateMenu
		if (this.displayValueDateMenu) {
			this.displayOwnersMenu = false
			this.displayLanguagesMenu = false
			this.displayVersionsMenu = false
		}
	}

	dateUpdated(date: CustomEventDetail['date-updated']): void {
		const parts = date.detail.value?.split('-')
		if (parts && parts.length === 3) {
			const fuzzyDateValue = parseInt(parts[0]) * 10000 + parseInt(parts[1]) * 100 + parseInt(parts[2])
			const valueId = this.valueId
			this.handleMetadataChanged && this.handleMetadataChanged({ label: this.metadata.label, valueDate: fuzzyDateValue * 1000000 }, valueId)
			this.displayOwnersMenu = false
		}
	}

	toggleLanguagesMenu() {
		this.displayLanguagesMenu = !this.displayLanguagesMenu
		if (this.displayLanguagesMenu) {
			this.displayOwnersMenu = false
			this.displayVersionsMenu = false
			this.displayValueDateMenu = false
		}
	}

	toggleVersionsMenu() {
		this.displayVersionsMenu = !this.displayVersionsMenu
		if (this.displayLanguagesMenu) {
			this.displayOwnersMenu = false
			this.displayLanguagesMenu = false
			this.displayValueDateMenu = false
		}
	}
}
