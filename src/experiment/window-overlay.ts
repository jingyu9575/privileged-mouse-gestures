class windowOverlay extends ExtensionAPI {
	private readonly overlayMap = new Map<string, {
		canvas: HTMLCanvasElement, onClose: { close: () => void }
	}>()

	private overlayKey(extension: Extension, windowId: number) {
		return `${extension.uuid}@${windowId}`
	}

	getAPIImpl = (that: this, context: BaseContext) => ({
		async setWindowOverlay(windowId: number, imageData: ImageData | null, {
			x = 0, y = 0, disableScaling = false
		} = {}) {
			const { extension } = context
			const { windowManager } = extension
			const wnd = windowManager.get(windowId, context).window

			const key = that.overlayKey(extension, windowId)
			let canvasData = that.overlayMap.get(key)

			if (!imageData) {
				if (canvasData) canvasData.onClose.close()
				return
			}

			const parent = wnd.document.documentElement
			if (!canvasData) {
				const canvas = wnd.document.createElementNS(
					"http://www.w3.org/1999/xhtml", 'canvas') as HTMLCanvasElement
				canvas.style.position = 'fixed'
				canvas.style.top = canvas.style.left = '0'
				canvas.style.width = '100%'
				canvas.style.height = '100%'
				canvas.style.zIndex = '5'
				canvas.style.pointerEvents = 'none'
				canvas.dataset.api = windowOverlay.name
				canvas.dataset.extensionUuid = extension.uuid
				parent.append(canvas)

				const onClose = {
					close() {
						canvas.remove()
						that.overlayMap.delete(key)
						extension.forgetOnClose(onClose)
					}
				}
				that.overlayMap.set(key, (canvasData = { canvas, onClose }))
				extension.callOnClose(onClose)
			}

			const factor = disableScaling ? wnd.devicePixelRatio : 1
			const canvasWidth = parent.clientWidth * factor | 0
			const canvasHeight = parent.clientHeight * factor | 0
			const { canvas } = canvasData
			if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
				canvas.width = canvasWidth
				canvas.height = canvasHeight
			}
			canvas.getContext('2d')!.putImageData(imageData, x, y)
		},

		async getWindowSize(windowId: number) {
			const wnd = context.extension.windowManager
				.get(windowId, context).window
			const parent = wnd.document.documentElement
			const { devicePixelRatio } = wnd
			return {
				width: parent.clientWidth, height: parent.clientHeight,
				devicePixelRatio,
			}
		},
	})

	getAPI(context: BaseContext) {
		return { [this.constructor.name]: this.getAPIImpl(this, context) }
	}
}
Object.assign(globalThis, { windowOverlay })
type windowOverlayAPI = ReturnType<typeof windowOverlay.prototype.getAPIImpl>
declare namespace browser { const windowOverlay: windowOverlayAPI }