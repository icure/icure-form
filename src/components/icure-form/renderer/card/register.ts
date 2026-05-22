import { IcureCardInternal } from './internal'

// Internal element used by renderer="card". Registered here so the renderer module is
// self-contained and the default theme can rely on a side-effect import without manual wiring.
if (!customElements.get('icure-card-internal')) {
	customElements.define('icure-card-internal', IcureCardInternal)
}
