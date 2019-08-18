import { localSettings, S } from "./settings.js";
import { importTemplateElement } from "../util/dom.js";

type MouseEventDetails = browser.windowEvents.MouseEventDetails
type WheelEventDetails = browser.windowEvents.WheelEventDetails

function getDistance(v0: MouseEventDetails, v1: MouseEventDetails) {
	return Math.hypot(v0.x - v1.x, v0.y - v1.y)
}

class DirectionList {
	private readonly k: number
	private readonly b: number

	constructor(private readonly items: ReadonlyArray<string>) {
		this.k = 2 * Math.PI / items.length
		this.b = -this.k / 2 - 2 * Math.PI // a - b > 0
	}

	get(v0: MouseEventDetails, v1: MouseEventDetails) {
		const a = Math.atan2(v1.y - v0.y, v1.x - v0.x)
		const i = (a - this.b) / this.k | 0
		return this.items[i % this.items.length]
	}
}

const buttonToButtons = [1, 4, 2, 8, 16] as const

export class MouseGestureListener {
	private mouseGestureButton = NaN
	private directionList = new DirectionList([''])
	private downDetails?: MouseEventDetails // undefined if not holding gesture button
	private lastDetails?: MouseEventDetails // undefined if normal gestures are stopped
	private currentCode = ''

	private static readonly canvasContextLayers =
		['traceCanvasContext', 'statusCanvasContext'] as const
	private traceCanvasContext?: CanvasRenderingContext2D
	private statusCanvasContext?: CanvasRenderingContext2D
	private compositionCanvasContext?: CanvasRenderingContext2D
	private readonly compositionAlphaMap = new WeakMap<CanvasRenderingContext2D, number>()
	private statusLastRect: [number, number, number, number] = [0, 0, 0, 0]
	private canvasScaling = 1

	get hasCommitted() { return this.lastDetails !== this.downDetails }

	constructor() {
		browser.windowEvents.onMouseDown.addListener(this.onMouseDown)
		browser.windowEvents.onMouseUp.addListener(this.onMouseUp)
		localSettings.listen('mouseGestureButton', value => {
			this.mouseGestureButton = {
				left: 0, middle: 1, right: 2, '': NaN,
			}[value || '']
			if (value === 'right')
				browser.browserSettings.contextMenuShowEvent.set({ value: "mouseup" })
			else
				browser.browserSettings.contextMenuShowEvent.clear({})
		})
		localSettings.listen('gestureDirections', value => {
			this.directionList = new DirectionList(
				value ? value.split(/(?=[A-Z])/) : [''])
		})
		localSettings.listen('rockerGestures', value => {
			if (value)
				browser.windowEvents.onMouseDown.addListener(this.onRockerMouseDown)
			else
				browser.windowEvents.onMouseDown.removeListener(this.onRockerMouseDown)
		})
	}

	private readonly statusMeasurer = new class {
		readonly container = document.body.appendChild(importTemplateElement(
			'text-measurer-template')) as HTMLElement
		readonly text = this.container.querySelector(
			'.text-measurer-text') as HTMLElement
		readonly baseline = this.container.querySelector(
			'.text-measurer-baseline') as HTMLElement
	}

	private readonly onMouseDown = (details: MouseEventDetails) => {
		if (this.downDetails && details.button !== this.downDetails.button) {
			this.stopNormalGestures()
			return
		}
		if (details.button !== this.mouseGestureButton) return
		if (details.buttons !== buttonToButtons[details.button]) return
		this.downDetails = this.lastDetails = details
		this.currentCode = ''
		browser.windowEvents.onMouseMove.addListener(this.onMouseMove,
			{ windowId: details.windowId })

		if (S.wheelGestures)
			browser.windowEvents.onWheel.addListener(this.onWheel,
				{ blockButtons: 0, windowId: details.windowId })
	}

	private readonly onMouseMove = (details: MouseEventDetails) => {
		if (!this.lastDetails || !this.downDetails) return
		if (details.windowId !== this.downDetails.windowId) return
		if (!(details.buttons & buttonToButtons[this.downDetails.button])) {
			this.reset()
			return
		}

		const threshold = this.hasCommitted ? S.distanceStep : S.distanceThreshold
		if (getDistance(details, this.lastDetails) < threshold) return

		if (!this.hasCommitted) {
			this.blockContextMenu()
			this.canvasScaling = details.devicePixelRatio

			function createCanvasContext(scaling: number) {
				const canvas = document.createElement('canvas')
				canvas.width = details.clientWidth * details.devicePixelRatio
				canvas.height = details.clientHeight * details.devicePixelRatio
				const ctx = canvas.getContext('2d')!
				if (scaling !== 1) ctx.scale(scaling, scaling)
				return ctx
			}

			if (S.displayTrace) {
				this.traceCanvasContext = createCanvasContext(this.canvasScaling)
				this.traceCanvasContext.strokeStyle = S.traceColor
				this.compositionAlphaMap.set(this.traceCanvasContext,
					S.traceColorAlpha / 100)
				this.traceCanvasContext.lineWidth = S.traceWidth
				this.traceCanvasContext.lineCap = 'round'
			}
			if (S.displayStatus) {
				this.statusCanvasContext = createCanvasContext(this.canvasScaling)
				this.statusCanvasContext.font = S.statusFont
				this.statusCanvasContext.textBaseline = 'middle'
				this.statusMeasurer.text.style.font = S.statusFont
				this.statusLastRect = [0, 0, 0, 0]
			}
			if (MouseGestureListener.canvasContextLayers.some(k => this[k]))
				this.compositionCanvasContext = createCanvasContext(1)
		}

		const lastCurrentCode = this.currentCode
		const code = this.directionList.get(this.lastDetails, details)
		if (!this.currentCode.endsWith(code)) this.currentCode += code

		const dirtyRects: number[][] = []
		if (this.traceCanvasContext) {
			this.traceCanvasContext.beginPath()
			this.traceCanvasContext.moveTo(this.lastDetails.x, this.lastDetails.y)
			this.traceCanvasContext.lineTo(details.x, details.y)
			this.traceCanvasContext.stroke()
			const x = Math.min(this.lastDetails.x, details.x) - S.traceWidth
			const y = Math.min(this.lastDetails.y, details.y) - S.traceWidth
			dirtyRects.push([x, y,
				Math.abs(this.lastDetails.x - details.x) + 2 * S.traceWidth,
				Math.abs(this.lastDetails.y - details.y) + 2 * S.traceWidth])
		}
		if (this.statusCanvasContext && lastCurrentCode !== this.currentCode) {
			this.statusCanvasContext.clearRect(...this.statusLastRect)
			dirtyRects.push(this.statusLastRect)

			let status = this.onGetStatus(this.currentCode)

			this.statusMeasurer.text.textContent = status
			const w = this.statusMeasurer.container.offsetWidth
			const h = this.statusMeasurer.container.offsetHeight
			const x = (this.statusCanvasContext.canvas.width / this.canvasScaling - w) *
				(S.statusPositionX / 100)
			const y = (this.statusCanvasContext.canvas.height / this.canvasScaling - h) *
				(S.statusPositionY / 100)

			let delta = 1
			this.statusCanvasContext.fillStyle = S.statusBorderColor
			this.statusCanvasContext.globalAlpha = S.statusBorderColorAlpha / 100
			this.statusCanvasContext.fillRect(x - delta, y - delta,
				w + delta * 2, h + delta * 2)
			this.statusCanvasContext.fillStyle = S.statusBackgroundColor
			this.statusCanvasContext.globalAlpha = S.statusBackgroundColorAlpha / 100
			this.statusCanvasContext.clearRect(x, y, w, h)
			this.statusCanvasContext.fillRect(x, y, w, h)
			this.statusCanvasContext.fillStyle = S.statusTextColor
			this.statusCanvasContext.globalAlpha = S.statusTextColorAlpha / 100
			this.statusCanvasContext.fillText(status,
				x + this.statusMeasurer.text.offsetLeft,
				y + this.statusMeasurer.baseline.offsetTop)
			delta += 1 // anti-aliasing border
			this.statusLastRect = [x - delta, y - delta, w + delta * 2, h + delta * 2]
			dirtyRects.push(this.statusLastRect)
		}

		for (const rect of dirtyRects) {
			const [lx, ly, lw, lh] = rect
			const x = lx * this.canvasScaling | 0, y = ly * this.canvasScaling | 0
			const w = Math.ceil((lx + lw) * this.canvasScaling) - x
			const h = Math.ceil((ly + lh) * this.canvasScaling) - y
			if (w <= 0 || h <= 0) continue
			this.compositionCanvasContext!.clearRect(x, y, w, h)
			for (const ctx of MouseGestureListener.canvasContextLayers) {
				if (!this[ctx]) continue
				this.compositionCanvasContext!.globalAlpha =
					this.compositionAlphaMap.get(this[ctx]!) || 1
				this.compositionCanvasContext!.drawImage(this[ctx]!.canvas,
					x, y, w, h, x, y, w, h)
			}
			browser.windowOverlay.setWindowOverlay(details.windowId,
				this.compositionCanvasContext!.getImageData(x, y, w, h),
				{ x, y, disableScaling: true })
		}

		this.lastDetails = details
	}

	private readonly onMouseUp = (details: MouseEventDetails) => {
		if (!this.downDetails) return
		if (details.button !== this.downDetails.button) return
		if (this.hasCommitted) {
			try {
				this.onGesture(this.currentCode, details.windowId)
			} catch (error) { console.error(error) }
		}
		this.reset()
	}

	private readonly onContextMenu = () => {
		// At most once (fallback)
		browser.windowEvents.onContextMenu.removeListener(this.onContextMenu)
	}

	private readonly onWheel = ({ deltaX, deltaY }: WheelEventDetails) => {
		if (!this.downDetails) return
		const direction = !deltaX && deltaY ? (deltaY > 0 ? 'D' : 'U') :
			!deltaY && deltaX ? (deltaX > 0 ? 'R' : 'L') : undefined
		if (!direction) return
		this.stopNormalGestures()
		this.blockContextMenu()
		this.onGesture('Wheel' + direction, this.downDetails.windowId)
	}

	private readonly onRockerMouseDown = (details: MouseEventDetails) => {
		const direction = details.button === 0 && (details.buttons & 2) ? 'L' :
			details.button === 2 && (details.buttons & 1) ? 'R' : undefined
		if (!direction) return
		this.onGesture('Rocker' + direction, details.windowId)
		for (const event of ['onMouseUp', 'onContextMenu'] as const)
			browser.windowEvents[event].addListener(this.onRockerBlockMenu,
				{ windowId: details.windowId, blockButtons: 0 })
	}

	private readonly onRockerBlockMenu = (details: MouseEventDetails) => {
		if (details.buttons) return
		for (const event of ['onMouseUp', 'onContextMenu'] as const)
			browser.windowEvents[event].removeListener(this.onRockerBlockMenu)
	}

	private blockContextMenu() {
		if (!this.downDetails) return
		browser.windowEvents.onContextMenu.addListener(this.onContextMenu, {
			windowId: this.downDetails.windowId, blockButtons: this.downDetails.button
		})
	}

	private stopNormalGestures() {
		browser.windowEvents.onMouseMove.removeListener(this.onMouseMove)
		if (this.downDetails)
			browser.windowOverlay.setWindowOverlay(this.downDetails.windowId, null)
		this.lastDetails = undefined
		this.currentCode = ''
		this.statusMeasurer.text.textContent = ''
		for (const key of [
			...MouseGestureListener.canvasContextLayers,
			'compositionCanvasContext',
		] as const) if (this[key]) {
			this[key]!.canvas.width = 1
			this[key]!.canvas.height = 1
			this[key] = undefined
		}
	}

	private reset() {
		this.stopNormalGestures()
		this.downDetails = undefined
		browser.windowEvents.onContextMenu.removeListener(this.onContextMenu)
		browser.windowEvents.onWheel.removeListener(this.onWheel)
	}

	onGesture: (gesture: string, windowId: number) => void = () => { }
	onGetStatus: (gesture: string) => string = () => ''
}