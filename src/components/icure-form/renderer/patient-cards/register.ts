import { IcurePatientCardsInternal } from './internal'

// Internal element used by renderer="patient-cards". Registered here so the renderer module is
// self-contained and the default theme can rely on a side-effect import without manual wiring.
if (!customElements.get('icure-patient-cards-internal')) {
	customElements.define('icure-patient-cards-internal', IcurePatientCardsInternal)
}
