import { RemoteSettings } from "../util/webext/settings.js";

export type CommandKey = keyof I18nMessages

export class Settings {
	version = 0

	mouseGestureButton: 'left' | 'middle' | 'right' = 'right'
	displayTrace = true
	traceColor = '#0652ff'
	traceColorAlpha = 80
	traceWidth = 3
	displayStatus = true
	statusFont = '24pt monospace'
	statusTextColor = '#000000'
	statusTextColorAlpha = 90
	statusBackgroundColor = '#ffffe4'
	statusBackgroundColorAlpha = 90
	statusBorderColor = '#b7c9e2'
	statusBorderColorAlpha = 90
	statusPositionX = 50
	statusPositionY = 90
	gestureDirections: 'RDLU' | 'RRdDLdLLuURu' = 'RDLU'
	wheelGestures = true
	rockerGestures = true

	gestureMappings: [string, CommandKey][] = [
		['UR', 'newTab'], ['DR', 'closeTab'],
		['L', 'back'], ['R', 'forward'], ['DU', 'upperLevel'],
		['U', 'scrollUp'], ['D', 'scrollDown'],
		['RU', 'scrollToTop'], ['RD', 'scrollToBottom'],
		['WheelU', 'previousTab'], ['WheelD', 'nextTab'],
	]

	// hidden
	distanceThreshold = 10
	distanceStep = 10
}

export const remoteSettings = new RemoteSettings(new Settings)