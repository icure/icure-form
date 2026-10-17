import { Stencil } from '../src/components/model'
// @ts-ignore
import face from './stencils/face.svg'
// @ts-ignore
import body from './stencils/body.svg'

// The demo's own stencils. A real host resolves stencil ids from its own (licensed) image library; icure-form ships
// no images. Ids it does not know stay unresolved, and the field falls back to a blank canvas.
const STENCILS: Stencil[] = [
	{ id: 'face', label: 'Face', src: face, width: 400, height: 500, mime: 'image/svg+xml' },
	{ id: 'body-male', label: 'Body', src: body, width: 300, height: 700, mime: 'image/svg+xml' },
	{ id: 'body-female', label: 'Body', src: body, width: 300, height: 700, mime: 'image/svg+xml' },
]

export const demoStencilProvider = async (ids: string[]): Promise<Stencil[]> => STENCILS.filter((s) => ids.includes(s.id))
