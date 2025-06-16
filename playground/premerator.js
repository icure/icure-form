async function* premerator() {
	yield Promise.resolve(1)
	yield Promise.resolve(2)
	yield Promise.resolve(3)
	yield Promise.resolve(4)
}

async function main() {
	const generator = premerator()

	await generator.next().then(console.log) // { value: 1, done: false }
	await generator.next().then(console.log) // { value: 2, done: false }
	await generator.next().then(console.log) // { value: 3, done: false }
	await generator.next().then(console.log) // { value: 4, done: false }
	await generator.next().then(console.log) // { value: undefined, done: true }
}

main().catch(console.error)
