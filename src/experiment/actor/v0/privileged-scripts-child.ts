export { }

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm")

class PrivilegedScripts_privileged_mouse_gestures_qw_thucfb_comChild
	extends JSWindowActorChild {
	private readonly sandboxMap = new Map<string, any>()
	private readonly systemPrincipal: 'nsIPrincipal' =
		(Components as any).classes["@mozilla.org/systemprincipal;1"]
			.createInstance((Components as any).interfaces.nsIPrincipal)

	constructor() {
		super()
		Services.cpmm.addMessageListener('Extension:Shutdown',
			(message: ReceiveMessageArgument) => {
				const id = message.data.id
				const sandbox = this.sandboxMap.get(id)
				if (!sandbox) return
				Components.utils.nukeSandbox(sandbox)
				this.sandboxMap.delete(id)
			})
	}

	async receiveMessage(message: ReceiveMessageArgument) {
		if (message.name === 'executeScript') {
			if (!this.contentWindow) return undefined
			const { extensionId: id, code, url } = message.data

			let sandbox = this.sandboxMap.get(id)
			if (!sandbox) {
				sandbox = Components.utils.Sandbox(this.systemPrincipal, {
					sameZoneAs: this.contentWindow,
					sandboxName: `PrivilegedScripts_${id}`,
					sandboxPrototype: this.contentWindow,
					wantComponents: true,
					wantExportHelpers: true,
					wantXrays: true,
				})
				this.sandboxMap.set(id, sandbox)
			}

			try {
				let result: any
				if (code != null) {
					result = Components.utils.evalInSandbox(code, sandbox, 'true')
				} else if (url != null) {
					result = ChromeUtils.compileScript(url,
						{ hasReturnValue: true }).executeInGlobal(sandbox)
				}
				return { result: await result }
			} catch (error) {
				return { error: error.message }
			}
		}
		return undefined
	}
}

var EXPORTED_SYMBOLS = [
	PrivilegedScripts_privileged_mouse_gestures_qw_thucfb_comChild.name
]
void EXPORTED_SYMBOLS