class privilegedScripts extends ExtensionAPI {
	private static actorURL: string = (globalThis as any).extensions
		.modules.get(privilegedScripts.name).url.replace(/\/[^\/]*$/, '/actor/v0/')
	private static actorName = 'PrivilegedScripts_privileged_mouse_gestures_qw_thucfb_com'
	private static refCount = 0

	private static init(context: BaseContext) {
		let Services: any
		try {
			Services = ChromeUtils.import("resource://gre/modules/Services.jsm").Services
		} catch { Services = (globalThis as any).Services }
		const mozExtHandler = Services.io.getProtocolHandler("moz-extension")
			.QueryInterface(Components.interfaces.nsISubstitutingProtocolHandler)
		const resHandler = Services.io.getProtocolHandler("resource")
			.QueryInterface(Components.interfaces.nsIResProtocolHandler)
		const resName = 'PrivilegedScripts_privileged_mouse_gestures_qw_thucfb_com'
		const jarURL = mozExtHandler.getSubstitution(context.extension.uuid).spec
		resHandler.setSubstitution(resName, Services.io.newURI(jarURL, null, null))
		const rand = `${Date.now()}_${Math.random()}`
		ChromeUtils.registerWindowActor(this.actorName, {
			allFrames: true,
			parent: {
				moduleURI: `resource://${resName}/experiment/actor/v0/privileged-scripts-parent.js?rand=${rand}`,
			},
			child: {
				moduleURI: `resource://${resName}/experiment/actor/v0/privileged-scripts-child.js?rand=${rand}`,
			}
		})
		privilegedScripts.refCount++
	}

	static close() {
		if (--privilegedScripts.refCount) return
		ChromeUtils.unregisterWindowActor(this.actorName)
	}

	getAPIImpl = (_that: this, context: BaseContext) => ({
		_init: (() => {
			privilegedScripts.init(context)
			context.extension.callOnClose(privilegedScripts)
		})(),

		async executeScript({
			tabId = -1, allFrames = false,
			code = undefined as string | undefined,
			file = undefined as string | undefined,
		}) {
			const { extension } = context
			const { tabManager } = extension
			const rootBC = tabManager.get(tabId).browser.browsingContext

			const promises: Promise<{ result?: any; error?: any }>[] = []
			function executeOnContext(bc: typeof rootBC) {
				const global = bc.currentWindowGlobal
				if (!global) return
				const actor = global.getActor(privilegedScripts.actorName)
				promises.push(actor.sendQuery("executeScript", {
					extensionId: extension.id,
					code,
					url: file !== undefined ? extension.getURL(file) : undefined
				}))
				if (allFrames) [...bc.getChildren()].forEach(executeOnContext)
			}
			executeOnContext(rootBC)
			return (await Promise.all(promises)).map(v => {
				if (v && v.error) throw { message: v.error }
				return v && v.result
			})
		}
	})

	getAPI(context: BaseContext) {
		return { [this.constructor.name]: this.getAPIImpl(this, context) }
	}
}
Object.assign(globalThis, { privilegedScripts })
type privilegedScriptsAPI = ReturnType<typeof privilegedScripts.prototype.getAPIImpl>
declare namespace browser { const privilegedScripts: privilegedScriptsAPI }
