// Mock for lit — only the parts used transitively by form-values-container.ts
module.exports = {
	html: () => '',
	css: () => '',
	LitElement: class {},
	TemplateResult: class {},
}