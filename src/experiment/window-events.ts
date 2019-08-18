export { }

var { ExtensionCommon: {
	EventManager,
} } = ChromeUtils.import('resource://gre/modules/ExtensionCommon.jsm')
var { ExtensionParent: {
	apiManager: { global: { windowTracker } }
} } = ChromeUtils.import("resource://gre/modules/ExtensionParent.jsm")

type MouseEventDetails = browser.windowEvents.MouseEventDetails
type WheelEventDetails = browser.windowEvents.WheelEventDetails

interface MouseEventOptions {
	windowId?: number
	blockButtons?: number
}

class windowEvents extends ExtensionAPI {
	private registerMouseEvent(fire: { async(details: MouseEventDetails): void },
		type: 'mousedown' | 'mouseup' | 'mousemove' | 'contextmenu' | 'wheel',
		context: BaseContext, options?: MouseEventOptions
	) {
		const { windowManager } = context.extension
		const map = new WeakMap<Window, (e: MouseEvent) => void>()

		const inject = (wnd: Window, isRemove?: boolean) => {
			const wrapper = windowManager.getWrapper(wnd)
			if (!wrapper) return
			const target = wnd.document.documentElement
			if (!target) return
			// XUL <window> has screen position
			const targetScreenPos: { screenX: number, screenY: number } =
				'screenX' in target && 'screenY' in target ? target : wnd

			if (isRemove) {
				const listener = map.get(wnd)
				if (!listener) return
				target.removeEventListener(type, listener, true)
			} else {
				const listener = (event: MouseEvent) => {
					const {
						altKey, button, buttons, screenX, screenY,
						ctrlKey, metaKey, movementX, movementY, shiftKey
					} = event
					if (options && options.blockButtons != null && (
						(button & options.blockButtons) || options.blockButtons === 0
					)) {
						event.preventDefault()
						event.stopPropagation()
					}

					const details = {
						altKey, button, buttons,
						x: screenX - targetScreenPos.screenX,
						y: screenY - targetScreenPos.screenY,
						ctrlKey, metaKey, movementX, movementY, shiftKey,
						windowId: wrapper.id,
						clientWidth: target.clientWidth,
						clientHeight: target.clientHeight,
						devicePixelRatio: wnd.devicePixelRatio,
					}
					if (type === 'wheel') {
						const { deltaMode, deltaX, deltaY, deltaZ } = event as WheelEvent
						Object.assign(details, { deltaMode, deltaX, deltaY, deltaZ })
					}
					fire.async(details)
				}
				target.addEventListener(type, listener, true)
				map.set(wnd, listener)
			}
		}

		if (options && options.windowId != null) {
			const wnd = windowManager.get(options.windowId, context).window
			inject(wnd)
			return () => { inject(wnd, true) }
		}

		for (const wnd of windowTracker.browserWindows()) inject(wnd)
		windowTracker.addOpenListener(inject)
		return () => {
			windowTracker.removeOpenListener(inject)
			for (const wnd of windowTracker.browserWindows()) inject(wnd, true)
		}
	}

	getAPIImpl = (that: this, context: BaseContext) => ({
		onMouseDown: new EventManager<[MouseEventDetails], [MouseEventOptions?]>({
			context, name: "windowEvents.onMouseDown", register: (fire, options) =>
				that.registerMouseEvent(fire, 'mousedown', context, options)
		}).api(),
		onMouseUp: new EventManager<[MouseEventDetails], [MouseEventOptions?]>({
			context, name: "windowEvents.onMouseUp", register: (fire, options) =>
				that.registerMouseEvent(fire, 'mouseup', context, options)
		}).api(),
		onMouseMove: new EventManager<[MouseEventDetails], [MouseEventOptions?]>({
			context, name: "windowEvents.onMouseMove", register: (fire, options) =>
				that.registerMouseEvent(fire, 'mousemove', context, options)
		}).api(),
		onContextMenu: new EventManager<[MouseEventDetails], [MouseEventOptions?]>({
			context, name: "windowEvents.onContextMenu", register: (fire, options) =>
				that.registerMouseEvent(fire, 'contextmenu', context, options)
		}).api(),
		onWheel: new EventManager<[WheelEventDetails], [MouseEventOptions?]>({
			context, name: "windowEvents.onContextMenu", register: (fire, options) =>
				that.registerMouseEvent(fire, 'wheel', context, options)
		}).api(),
	})

	getAPI(context: BaseContext) {
		return { [this.constructor.name]: this.getAPIImpl(this, context) }
	}
}
Object.assign(globalThis, { windowEvents })
type API = ReturnType<typeof windowEvents.prototype.getAPIImpl>
declare global {
	namespace browser { const windowEvents: API }
	namespace browser.windowEvents {
		interface MouseEventDetails extends Pick<MouseEvent,
			'altKey' | 'button' | 'buttons' | 'x' | 'y' |
			'ctrlKey' | 'metaKey' | 'movementX' | 'movementY' | 'shiftKey'> {
			windowId: number
			clientWidth: number
			clientHeight: number
			devicePixelRatio: number
		}

		interface WheelEventDetails extends MouseEventDetails, Pick<WheelEvent,
			'deltaMode' | 'deltaX' | 'deltaY' | 'deltaZ'> { }
	}
}
