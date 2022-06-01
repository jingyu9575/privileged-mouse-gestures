export { }

declare class EventManager<Ts extends any[], As extends any[] = []> {
	constructor(params: {
		context: BaseContext, name: string,
		register: (fire: { async(...args: Ts): void }, ...args: As)
			=> /*destroy*/ () => void
		inputHandling?: boolean,
		persistent?: { module: string, event: string }
	})

	api(): {
		addListener(listener: (...args: Ts) => void, ...args: As): void
		removeListener(listener: (...args: Ts) => void): void
		hasListener(listener: (...args: Ts) => void): boolean
	}
}

interface WindowTracker {
	browserWindows(includeIncomplete?: boolean): IterableIterator<Window>
	readonly topWindow: Window | null
	readonly topNonPBWindow: Window | null
	getTopWindow(context: BaseContext): Window | null
	getId(window: Window): number
	getCurrentWindow(context: Window): Window | null
	getWindow(id: number, context: BaseContext, strict?: boolean): Window | undefined
	addOpenListener(listener: (window: Window) => void): void
	removeOpenListener(listener: (window: Window) => void): void
	addCloseListener(listener: (window: Window) => void): void
	removeCloseListener(listener: (window: Window) => void): void
	addListener(type: string, listener: (window: Window) => void | object): void
	removeListener(type: string, listener: (window: Window) => void | object): void
	addProgressListener(window: Window, listener: object): void
	removeProgressListener(window: Window, listener: object): void
}

interface FallbackTabSize { width: number, height: number }

interface NativeTab extends Element { }

interface BrowsingContext {
	currentWindowGlobal: {
		getActor(name: string): JSWindowActor
	}
	getChildren(): BrowsingContext[]
}

interface XULBrowserElement extends Element {
	readonly browsingContext: BrowsingContext
}

interface TabBase extends browser.tabs.Tab {
	readonly extension: Extension
	readonly nativeTab: NativeTab
	readonly id: number
	readonly innerWindowID: number | null
	readonly hasTabPermission: boolean
	readonly hasActiveTabPermission: boolean
	readonly browser: XULBrowserElement
	matches(queryInfo: TabQueryInfo, context: BaseContext): boolean
	convert(fallbackTabSize: FallbackTabSize): browser.tabs.Tab
}

interface WindowBase {
	readonly extension: Extension
	readonly window: Window
	readonly id: number
	readonly xulWindow: object
	isCurrentFor(context: BaseContext): boolean
	readonly type: browser.windows.WindowType
	convert(getInfo: browser.windows.GetInfo): browser.windows.Window
	matches(queryInfo: WindowQueryInfo, context: BaseContext): boolean
	readonly focused: boolean
	readonly top: number
	readonly left: number
	readonly width: number
	readonly height: number
	readonly incognito: boolean
	readonly alwaysOnTop: boolean
	readonly isLastFocused: boolean
	state: browser.windows.WindowState
	readonly title: string
	getTabs(): IterableIterator<TabBase>
	getHighlightedTabs(): IterableIterator<TabBase>
	readonly activeTab: TabBase
	getTabAtIndex(index: number): TabBase | undefined
}

type TabQueryInfo = Pick<Parameters<typeof browser.tabs.query>[0],
	'active' | 'audible' | 'cookieStoreId' | 'discarded' | 'hidden' |
	'highlighted' | 'index' | 'muted' | 'pinned'
	| 'status' | 'title' | 'screen' | 'camera' | 'microphone'>

type WindowQueryInfo = Pick<Parameters<typeof browser.tabs.query>[0],
	'currentWindow' | 'lastFocusedWindow' | 'windowId' | 'windowType'>

interface TabManager {
	readonly extension: Extension
	hasTabPermission(nativeTab: NativeTab): boolean
	getWrapper(nativeTab: NativeTab): TabBase
	canAccessTab(nativeTab: NativeTab): boolean
	convert(nativeTab: NativeTab, fallbackTabSize: FallbackTabSize): browser.tabs.Tab
	query(queryInfo: TabQueryInfo | WindowQueryInfo,
		context?: BaseContext): IterableIterator<TabBase>
	get(tabId: number): TabBase
}

interface WindowManager {
	readonly extension: Extension
	convert(window: Window, getInfo: browser.windows.GetInfo): browser.windows.Window
	getWrapper(window: Window): WindowBase
	query(queryInfo?: WindowQueryInfo, context?: BaseContext): IterableIterator<WindowBase>
	get(windowId: number, context: BaseContext): WindowBase
	getAll(context: BaseContext): Iterator<WindowBase>
	canAccessWindow(window: Window, context?: BaseContext): boolean
}

interface Sandbox { }

declare global {
	const Components: {
		utils: {
			Sandbox(principal: Window | string | null, options?: {
				freshZone?: boolean
				sameZoneAs?: object
				sandboxName?: string
				sandboxPrototype?: object
				wantComponents?: boolean
				wantExportHelpers?: boolean
				wantGlobalProperties?: boolean
				wantXrays?: boolean
			}): Sandbox
			evalInSandbox(source: string, sandbox: Sandbox,
				version?: string, filename?: string, lineNo?: number): any
			nukeSandbox(sandbox: Sandbox): void
		}
		manager: any
		interfaces: any
	}

	class ExtensionAPI {
		getAPI(context: BaseContext): object
	}

	interface Extension {
		readonly id: string
		readonly uuid: string
		readonly activePermissions: {
			origins: string[]
			permissions: string[]
			apis: string[]
		}
		readonly manifestPermissions: {
			origins: string[]
			permissions: string[]
		}
		callOnClose(handler: { close(): void }): void
		forgetOnClose(handler: { close(): void }): void
		getLocalizedManifest(locale: string): browser._manifest.WebExtensionManifest
		getURL(path: string): string
		readonly tabManager: TabManager
		readonly windowManager: WindowManager
	}

	interface BaseContext {
		extension: Extension

		close(): void // = unload()
		canAccessWindow(window: Window): boolean
	}

	const ChromeUtils: {
		import(url: 'resource://gre/modules/ExtensionCommon.jsm'): {
			ExtensionCommon: { EventManager: typeof EventManager }
		}
		import(url: 'resource://gre/modules/ExtensionParent.jsm'): {
			ExtensionParent: {
				apiManager: { global: { windowTracker: WindowTracker } }
			}
		}
		import(url: 'resource://gre/modules/ExtensionUtils.jsm'): {
			ExtensionUtils: { ExtensionError: typeof Error }
		}
		import(url: string): any

		registerWindowActor(name: string, options: {
			allFrames?: boolean
			includeChrome?: boolean
			matches?: string[]
			remoteTypes?: string[]
			parent?: { moduleURI: string }
			child?: {
				moduleURI: string
				events?: Record<string, AddEventListenerOptions>
				observers?: string[]
			}
		}): void
		unregisterWindowActor(name: string): void

		compileScript(url: string, options: {
			charset?: string, lazilyParse?: boolean, hasReturnValue?: boolean,
		}): {
			readonly url: string
			readonly hasReturnValue: boolean
			executeInGlobal(global: object): any
		}
	}

	class JSWindowActor {
		sendAsyncMessage(messageName: string, obj: any,
			transfers: Transferable[]): void
		sendQuery(messageName: string, obj: any,
			transfers?: Transferable[]): Promise<any>
		receiveMessage(argument: ReceiveMessageArgument): any
	}
	class JSWindowActorParent extends JSWindowActor { }
	class JSWindowActorChild extends JSWindowActor {
		document?: Document
		contentWindow?: Window
		docShell?: {}
	}

	interface ReceiveMessageArgument {
		target: unknown
		name: string
		data: any
	}

	const IOUtils: any
}