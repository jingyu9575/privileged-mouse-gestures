import { registerRemoteHandler } from "../util/webext/remote.js";
import { getCommandKeys, getCommandFunction } from './commands.js';
import { MouseGestureListener } from './mouse-gesture.js';
import { CommandKey } from "../common/settings.js";
import { localSettings } from "./settings.js";
import { M } from "../util/webext/i18n.js";

let gestureMappings = new Map<string, CommandKey>()
localSettings.listen('gestureMappings', m => { gestureMappings = new Map(m) })

let recordGesturePorts = new Set<browser.runtime.Port>()
browser.runtime.onConnect.addListener(port => {
	recordGesturePorts.add(port)
	port.onDisconnect.addListener(() => { recordGesturePorts.delete(port) })
})

const mouseGestureListener = new MouseGestureListener()
mouseGestureListener.onGesture = (gesture, windowId) => {
	if (recordGesturePorts.size) {
		for (const port of recordGesturePorts) {
			port.postMessage({ code: gesture })
			port.disconnect()
		}
		recordGesturePorts.clear()
		return
	}

	const key = gestureMappings.get(gesture)
	if (!key) return
	const fn = getCommandFunction(key)
	if (fn) fn(windowId)
}
mouseGestureListener.onGetStatus = (gesture) => {
	let status = gesture
	const key = gestureMappings.get(gesture)
	if (key) status += ': ' + M[key]
	return status
}

export class BackgroundRemote {
	async getCommandKeys() { return getCommandKeys() }
}
registerRemoteHandler(new BackgroundRemote)
