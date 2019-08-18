import "../common/elements/x-tab.js"
import { applyI18n, M, applyI18nAttr } from "../util/webext/i18n.js";
import { backgroundRemote } from "../common/common.js";
import { importTemplateElement } from "../util/dom.js";
import { remoteSettings, CommandKey, Settings } from "../common/settings.js";

applyI18n()

const mappingRowTemplate = document.getElementById(
	'mapping-row-template') as HTMLTemplateElement
const mappingTBody = document.querySelector('#mapping-table tbody')!

backgroundRemote.getCommandKeys().then(async sections => {
	applyI18nAttr('title', mappingRowTemplate.content)

	const commandSelectTemplate = mappingRowTemplate.content
		.querySelector('.command-select') as HTMLSelectElement
	while (commandSelectTemplate.firstChild)
		commandSelectTemplate.firstChild.remove()

	for (const [section, items] of sections) {
		const optgroup = document.createElement('optgroup')
		optgroup.label = M[section]
		commandSelectTemplate.append(optgroup)

		for (const item of items) {
			const option = document.createElement('option')
			option.value = item
			option.textContent = M[item]
			optgroup.append(option)
		}
	}

	function checkConflicts() {
		const map = new Map<string, HTMLInputElement>()
		for (const gestureInput of mappingTBody.querySelectorAll(
			'.gesture-input') as NodeListOf<HTMLInputElement>) {
			const last = map.get(gestureInput.value)
			if (last) {
				last.setCustomValidity(M.gestureConflict)
				gestureInput.setCustomValidity(M.gestureConflict)
			} else {
				gestureInput.setCustomValidity('')
			}
			map.set(gestureInput.value, gestureInput)
		}
	}

	function saveMappings() {
		void remoteSettings.set({
			gestureMappings: [
				...mappingTBody.querySelectorAll(':scope > .mapping-row')
			].map(tr => [
				(tr.querySelector('.gesture-input') as HTMLSelectElement).value,
				(tr.querySelector('.command-select') as HTMLSelectElement).value,
			] as [string, CommandKey])
		})
		checkConflicts()
	}

	let recordPort: browser.runtime.Port | undefined

	function stopRecording() {
		for (const v of mappingTBody.querySelectorAll('.recording'))
			v.classList.remove('recording')
		if (recordPort) {
			recordPort.disconnect()
			recordPort = undefined
		}
	}
	document.addEventListener('click', event => {
		if ((event.target as Element).closest('.record')) return
		stopRecording()
	}, true)

	function addMappingRow(gesture: string, command?: CommandKey) {
		const tr = importTemplateElement(mappingRowTemplate)
		const gestureInput = tr.querySelector('.gesture-input') as HTMLInputElement
		gestureInput.value = gesture
		if (command !== undefined) {
			const commandSelect = tr.querySelector('.command-select') as HTMLSelectElement
			commandSelect.value = command
		}
		mappingTBody.append(tr)

		tr.querySelector('.remove')!.addEventListener('click',
			() => { tr.remove(); saveMappings() })
		tr.querySelector('.record')!.addEventListener('click', () => {
			const existing = tr.classList.contains('recording')
			stopRecording()
			if (existing) return
			tr.classList.add('recording')
			recordPort = browser.runtime.connect(undefined, { name: 'recordGesture' })
			recordPort.onMessage.addListener(({ code }: any) => {
				if (!code) return
				gestureInput.value = code
				saveMappings()
			})
			recordPort.onDisconnect.addListener(stopRecording)
		})
	}

	async function reloadMappings() {
		const mappings = await remoteSettings.get('gestureMappings')
		while (mappingTBody.firstChild) mappingTBody.firstChild.remove()
		for (const [gesture, command] of mappings)
			addMappingRow(gesture, command)
	}
	await reloadMappings()
	checkConflicts()
	
	mappingTBody.addEventListener('change', event => {
		const target = event.target as HTMLElement
		if (target.classList.contains('gesture-input') ||
			target.classList.contains('command-select')) {
			saveMappings()
		}
	})

	document.getElementById('add-mapping-row')!.addEventListener('click',
		() => { addMappingRow(''); saveMappings() })
})

type InputCallback = (input: HTMLInputElement | HTMLSelectElement) => unknown
const inputCallbacks = new Map<keyof Settings, InputCallback>([
	['gestureDirections', input => {
		const directions = input.value.split(/(?=[A-Z])/)
		document.getElementById('gesture-directions-code-example')!
			.textContent = directions.join(' ')
		if (directions.some(v => v.match(/[^\w]/))) return

		const d1 = directions.join('|')
		const d2 = directions.map(d => `${d}${d}`).join('|')
		const other = `Wheel[RDLU]|Rocker[RL]`
		const pattern = `(?!.*(?:${d2}))(?:${d1})*|${other}`
		for (const p of [mappingTBody, mappingRowTemplate.content])
			for (const gestureInput of p.querySelectorAll(
				'.gesture-input') as NodeListOf<HTMLInputElement>)
				gestureInput.pattern = pattern
	}],
])

for (const input of document.querySelectorAll(
	'[data-key]') as NodeListOf<HTMLInputElement | HTMLSelectElement>) {
	const key = input.dataset.key!
	remoteSettings.get(key as any).then(value => {
		if (input.type === 'checkbox')
			(input as HTMLInputElement).checked = value
		else
			input.value = '' + value
		void (inputCallbacks.get(key as keyof Settings) || (_ => 0))(input)
	})
	input.addEventListener('change', () => {
		if (!input.checkValidity()) return
		let value: any
		if (input.type === 'number') {
			value = (!input.required && !input.value) ? '' : Number(input.value)
		} else if (input.type === 'checkbox')
			value = (input as HTMLInputElement).checked
		else value = input.value
		void remoteSettings.set({ [key]: value })
		void (inputCallbacks.get(key as keyof Settings) || (_ => 0))(input)
	})
}