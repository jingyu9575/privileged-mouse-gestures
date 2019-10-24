import { CommandKey } from "../common/settings.js";

type SectionKey = keyof I18nMessages
type CommandFunction = (windowId: number) => void

function tabCommand(next: (tab: browser.tabs.Tab, windowId: number) => void) {
	return async (windowId: number) => {
		const tabs = await browser.tabs.query({ active: true, windowId })
		if (tabs.length) next(tabs[0], windowId)
	}
}

function contentCommand<Ts extends any[]>(
	code: (...args: Ts) => void, ...args: Ts) {
	return tabCommand(tab => {
		browser.privilegedScripts.executeScript({
			tabId: tab.id,
			code: `(${code})(${args.map(v => JSON.stringify(v)).join(', ')})`
		})
	})
}

function docShellCommand(cmd: string) {
	return contentCommand((cmd: string) => {
		(window as any).docShell.doCommand(cmd)
	}, cmd)
}

const commandList: [SectionKey,
	[CommandKey, CommandFunction][]
][] = [['tab', [
	['newTab', windowId => {
		void browser.tabs.create({ windowId })
	}],
	['closeTab', tabCommand(tab => {
		if (!tab.pinned) browser.tabs.remove(tab.id!)
	})],
	['previousTab', tabCommand(async (tab, windowId) => {
		if (tab.index <= 0) return
		const query = await browser.tabs.query({ windowId, index: tab.index - 1 })
		if (query) void browser.tabs.update(query[0].id!, { active: true })
	})],
	['nextTab', tabCommand(async (tab, windowId) => {
		const query = await browser.tabs.query({ windowId, index: tab.index + 1 })
		if (query) void browser.tabs.update(query[0].id!, { active: true })
	})],
	['duplicateTab', tabCommand(tab => { browser.tabs.duplicate(tab.id!) })],
]], ['navigation', [
	['back', contentCommand(() => { history.back() })],
	['forward', contentCommand(() => { history.forward() })],
	['stop', contentCommand(() => { window.stop() })],
	['reload', tabCommand(tab => { browser.tabs.reload(tab.id!) })],
	['upperLevel', tabCommand(tab => {
		let url = new URL(tab.url!)
		if (!url.pathname || url.pathname === '/') {
			if (!url.hostname.includes('.')) return
			url.hostname = url.hostname.replace(/^[^.]*\./, '')
		} else {
			url = new URL(url.pathname.endsWith('/') ? '..' : './', url)
		}
		browser.tabs.update(tab.id!, { url: url.href })
	})],
]], ['page', [
	['scrollUp', docShellCommand('cmd_scrollPageUp')],
	['scrollDown', docShellCommand('cmd_scrollPageDown')],
	['scrollToTop', docShellCommand('cmd_scrollTop')],
	['scrollToBottom', docShellCommand('cmd_scrollBottom')],
]]]
const commandMap = new Map(commandList.flatMap(([_, items]) => items))

export function getCommandKeys() {
	return commandList.map(([section, items]) =>
		[section, items.map(([key]) => key)] as [SectionKey, CommandKey[]])
}

export function getCommandFunction(key: CommandKey) {
	return commandMap.get(key)
}