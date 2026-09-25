import { InstanceBase, InstanceStatus, UDPHelper, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig, type ModuleSecrets } from './config.js'
import { INTERNAL_VARIABLES, UpdateVariableDefinitions, pushVariables, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { decodeOscPacket, encodeOscMessage, type OscArg } from './osc.js'
import { INCOMING_VARIABLES, MAX_DYNAMIC_VARIABLES, ModuleState, clamp } from './state.js'

/** Flair streams state at ~50Hz; batch variable/feedback updates to this interval. */
const INCOMING_FLUSH_MS = 100
/** Mark the feedback stream idle after this long without a packet. */
const INCOMING_IDLE_MS = 3000

export type ModuleSchema = {
	config: ModuleConfig
	secrets: ModuleSecrets
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Set in init()/configUpdated()

	readonly state = new ModuleState()
	private udp: UDPHelper | undefined
	private pendingIncoming: Record<string, number | string> = {}
	private newIncomingVariables = false
	private flushTimer: NodeJS.Timeout | undefined
	private idleTimer: NodeJS.Timeout | undefined

	async init(config: ModuleConfig, _isFirstInit: boolean): Promise<void> {
		this.config = config
		this.applyConfigToState()

		this.updateActions()
		this.updateFeedbacks()
		this.updateVariableDefinitions()
		this.updatePresets()

		this.openSocket()
	}

	async destroy(): Promise<void> {
		await this.closeSocket()
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		await this.closeSocket()
		this.config = config
		this.state.reset()
		this.applyConfigToState()

		// Preset counts (triggers/axes/sections) come from config.
		this.updatePresets()
		this.updateVariableDefinitions()
		this.checkAllFeedbacks()
		this.openSocket()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	private applyConfigToState(): void {
		this.state.jogSpeed = clamp((this.config.jogSpeed ?? 50) / 100, 0.01, 1)
	}

	private openSocket(): void {
		const { host, port, listenPort } = this.config
		if (!host) {
			this.updateStatus(InstanceStatus.BadConfig, 'No Flair host configured')
			return
		}
		try {
			// Bound to the listen port (0 = any free port) so commands go out from it and feedback can come back to it.
			const udp = new UDPHelper(host, port, { bind_port: listenPort })
			udp.on('error', (err) => {
				this.state.lastError = err.message
				this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
				this.log('error', `UDP error: ${err.message}`)
				pushVariables(this)
			})
			udp.on('data', (msg) => this.handleIncoming(msg))
			this.udp = udp
			// UDP has no handshake: "Ok" means the socket is ready to send, not that Flair is listening.
			this.updateStatus(
				InstanceStatus.Ok,
				listenPort > 0 ? `Sending to ${host}:${port}, listening on ${listenPort}` : `Sending OSC to ${host}:${port}`,
			)
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			this.updateStatus(InstanceStatus.ConnectionFailure, msg)
			this.log('error', `Failed to open UDP socket: ${msg}`)
		}
	}

	/** Turns a packet streamed from Flair into throttled variable updates. */
	private handleIncoming(buf: Buffer): void {
		let messages
		try {
			messages = decodeOscPacket(buf)
		} catch {
			return // not OSC, or truncated - ignore
		}

		for (const { address, args } of messages) {
			const name = address.startsWith('/flair/') ? address.slice('/flair/'.length) : ''
			if (!/^[A-Za-z0-9_-]+$/.test(name)) continue // other prefixes, or nested paths
			const arg = args[0]
			if (arg === undefined) continue

			let id = name
			if (!(name in INCOMING_VARIABLES)) {
				id = name in INTERNAL_VARIABLES ? `osc_${name}` : name
				if (!this.state.dynamicVariables.has(id)) {
					if (this.state.dynamicVariables.size >= MAX_DYNAMIC_VARIABLES) continue
					this.state.dynamicVariables.set(id, `Flair: /flair/${name}`)
					this.newIncomingVariables = true
				}
			}

			// 3dp is plenty for positions/angles, and stops float noise re-triggering updates at 50Hz.
			const value =
				typeof arg === 'number' ? Math.round(arg * 1000) / 1000 : typeof arg === 'boolean' ? (arg ? 1 : 0) : arg
			if (this.state.incoming.get(id) === value) continue
			this.state.incoming.set(id, value)
			this.pendingIncoming[id] = value
		}

		if (!this.state.receiving) {
			this.state.receiving = true
			pushVariables(this)
			this.checkFeedbacks('receiving')
		}
		clearTimeout(this.idleTimer)
		this.idleTimer = setTimeout(() => {
			this.state.receiving = false
			pushVariables(this)
			this.checkFeedbacks('receiving')
		}, INCOMING_IDLE_MS)

		this.flushTimer ??= setTimeout(() => this.flushIncoming(), INCOMING_FLUSH_MS)
	}

	private flushIncoming(): void {
		this.flushTimer = undefined
		const values = this.pendingIncoming
		this.pendingIncoming = {}
		if (this.newIncomingVariables) {
			this.newIncomingVariables = false
			this.updateVariableDefinitions()
		}
		if (Object.keys(values).length === 0) return
		this.setVariableValues(values)
		this.checkFeedbacks('running', 'runstate_is')
	}

	private async closeSocket(): Promise<void> {
		clearTimeout(this.flushTimer)
		clearTimeout(this.idleTimer)
		this.flushTimer = this.idleTimer = undefined
		this.pendingIncoming = {}
		const udp = this.udp
		if (!udp) return
		if (this.config.zeroOnDestroy) {
			// Best effort: never leave a jog running when the connection goes away.
			for (const axis of this.state.movingAxes()) {
				try {
					await udp.sendAsync(encodeOscMessage(`/flair/move/${axis}`, [{ type: 'f', value: 0 }]))
				} catch {
					// socket already gone - nothing more we can do
				}
			}
		}
		udp.destroy()
		this.udp = undefined
	}

	/** Encodes and sends one OSC message to Flair, recording it as the last message sent. */
	async sendOsc(address: string, args: OscArg[] = []): Promise<boolean> {
		if (!this.udp) {
			this.log('warn', `Not sending ${address}: UDP socket is not open (check the connection status)`)
			return false
		}
		try {
			await this.udp.sendAsync(encodeOscMessage(address, args))
			const rendered = args.map((a) => (a.type === 'b' ? (a.value ? 'true' : 'false') : String(a.value)))
			this.state.lastMessage = [address, ...rendered].join(' ')
			pushVariables(this)
			return true
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			this.state.lastError = msg
			this.log('error', `Failed to send ${address}: ${msg}`)
			pushVariables(this)
			return false
		}
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}
}
