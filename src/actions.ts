import type { CompanionActionDefinition, SomeCompanionActionInputField } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { pushVariables } from './variables.js'
import { CARTS_MODES, MOVE_AXES, clamp, resolveAxis } from './state.js'

type AxisOptions = { axis: string; customAxis: string }
type OnOffToggle = 'on' | 'off' | 'toggle'

export type ActionsSchema = {
	stop: { options: Record<string, never> }
	goto_closest: { options: Record<string, never> }
	goto: { options: Record<string, never> }
	run_forward: { options: Record<string, never> }
	run_backward: { options: Record<string, never> }
	shoot: { options: Record<string, never> }
	auto_browse: { options: { direction: 'start' | 'end'; enable: boolean } }
	trigger: { options: { trigger: number; state: OnOffToggle } }
	prepare_part_section: { options: { section: number } }
	run_part_section: { options: { section: number } }
	move: { options: AxisOptions & { value: number } }
	jog: { options: AxisOptions & { direction: 'forward' | 'reverse' } }
	jog_speed: { options: { mode: 'set' | 'adjust'; value: number } }
	zero_moves: { options: Record<string, never> }
	hhb_speed: { options: { mode: 'set' | 'adjust'; value: number } }
	axis_engage: { options: { axis: number; state: 'engage' | 'disengage' | 'toggle' } }
	add_line: { options: Record<string, never> }
	delete_line: { options: Record<string, never> }
	store: { options: Record<string, never> }
	carts: { options: { mode: string } }
	raw_osc: {
		options: { address: string; argType: 'none' | 'int' | 'float' | 'string' | 'true' | 'false'; value: string }
	}
}

const axisFields = <Extra extends string>(): SomeCompanionActionInputField<keyof AxisOptions | Extra>[] => [
	{
		id: 'axis',
		type: 'dropdown',
		label: 'Axis',
		default: 'xcam',
		// isVisibleExpression on the custom-name field below may only reference fields that opt out of expressions.
		disableAutoExpression: true,
		choices: [
			...MOVE_AXES.map((a) => ({ id: a.id, label: a.label })),
			{ id: 'custom', label: 'Custom axis name (as named in Flair)' },
		],
	},
	{
		id: 'customAxis',
		type: 'textinput',
		label: 'Custom axis name',
		default: '',
		isVisibleExpression: '$(options:axis) == "custom"',
		tooltip: 'Sent as /flair/move/<name>. Use the axis name exactly as it appears in Flair.',
	},
]

const noOptions = (): [] => []

export function UpdateActions(self: ModuleInstance): void {
	const state = self.state

	/** Records a move demand locally (for feedback/variables) and sends it. */
	const sendMove = async (axis: string, value: number): Promise<void> => {
		const demand = clamp(value, -1, 1)
		if (await self.sendOsc(`/flair/move/${axis}`, [{ type: 'f', value: demand }])) {
			state.demands.set(axis, demand)
			self.checkFeedbacks('axis_moving')
			pushVariables(self)
		}
	}

	const simple = (
		address: string,
		name: string,
		description: string,
		onSent?: () => void,
	): CompanionActionDefinition<{ options: Record<string, never> }> => ({
		name,
		description,
		options: noOptions(),
		callback: async () => {
			if (await self.sendOsc(address)) {
				onSent?.()
				pushVariables(self)
			}
		},
	})

	const adjustSpeed = (mode: 'set' | 'adjust', value: number, current: number, min: number, max: number): number =>
		clamp(mode === 'set' ? value : current + value, min, max)

	self.setActionDefinitions({
		stop: simple('/flair/command/stop', 'Stop', 'Stop the current move/run.', () => {
			state.autoBrowse = ''
			self.checkFeedbacks('auto_browse')
		}),
		goto_closest: simple('/flair/command/gotoclosest', 'Go To Closest', 'Go to the closest line.'),
		goto: simple('/flair/command/goto', 'Go To', 'Go to the current line.'),
		run_forward: simple('/flair/command/fwdrun', 'Run Forward', 'Run the move forwards.'),
		run_backward: simple('/flair/command/backrun', 'Run Backward', 'Run the move backwards.'),
		shoot: simple('/flair/command/shoot', 'Shoot', 'Run the move as a shoot.'),

		auto_browse: {
			name: 'Auto Browse To Start / End',
			description: 'Start (or cancel) an automatic browse to the start or end of the move.',
			options: [
				{
					id: 'direction',
					type: 'dropdown',
					label: 'Direction',
					default: 'end',
					choices: [
						{ id: 'start', label: 'Browse to Start' },
						{ id: 'end', label: 'Browse to End' },
					],
				},
				{ id: 'enable', type: 'checkbox', label: 'Enable (untick to cancel)', default: true },
			],
			callback: async ({ options }) => {
				const address = options.direction === 'start' ? '/flair/command/browsestart' : '/flair/command/browseend'
				if (await self.sendOsc(address, [{ type: 'b', value: options.enable }])) {
					if (options.enable) state.autoBrowse = options.direction
					else if (state.autoBrowse === options.direction) state.autoBrowse = ''
					self.checkFeedbacks('auto_browse')
					pushVariables(self)
				}
			},
		},

		trigger: {
			name: 'Trigger On / Off / Toggle',
			description: 'Turn a Flair trigger (numbered from 1) on or off. Toggle uses the state Companion last sent.',
			options: [
				{ id: 'trigger', type: 'number', label: 'Trigger (1+)', default: 1, min: 1, max: 999 },
				{
					id: 'state',
					type: 'dropdown',
					label: 'State',
					default: 'toggle',
					choices: [
						{ id: 'on', label: 'On' },
						{ id: 'off', label: 'Off' },
						{ id: 'toggle', label: 'Toggle' },
					],
				},
			],
			callback: async ({ options }) => {
				const n = Math.trunc(options.trigger)
				const on = options.state === 'toggle' ? !state.triggers.has(n) : options.state === 'on'
				if (await self.sendOsc(on ? '/flair/command/trigon' : '/flair/command/trigoff', [{ type: 'i', value: n }])) {
					if (on) state.triggers.add(n)
					else state.triggers.delete(n)
					self.checkFeedbacks('trigger_on')
					pushVariables(self)
				}
			},
		},

		prepare_part_section: {
			name: 'Prepare Part-Run Section',
			description: 'Prepare a part-run section (numbered from 1) without running it.',
			options: [{ id: 'section', type: 'number', label: 'Section (1+)', default: 1, min: 1, max: 999 }],
			callback: async ({ options }) => {
				await self.sendOsc('/flair/command/partsection', [{ type: 'i', value: Math.trunc(options.section) }])
			},
		},

		run_part_section: {
			name: 'Prepare & Run Part-Run Section',
			description: 'Prepare a part-run section (numbered from 1) and run it.',
			options: [{ id: 'section', type: 'number', label: 'Section (1+)', default: 1, min: 1, max: 999 }],
			callback: async ({ options }) => {
				await self.sendOsc('/flair/command/runpartsection', [{ type: 'i', value: Math.trunc(options.section) }])
			},
		},

		move: {
			name: 'Move Demand (-1.0 to 1.0)',
			description:
				'Send a move demand to an axis. The demand holds until changed, so pair a non-zero value on ' +
				'press with a zero value on release for a hold-to-jog button. For Browse this is the move/goto browse demand.',
			options: [
				...axisFields<'value'>(),
				{ id: 'value', type: 'number', label: 'Demand (-1.0 to 1.0)', default: 0, min: -1, max: 1, step: 0.01 },
			],
			callback: async ({ options }) => {
				const axis = resolveAxis(options.axis, options.customAxis)
				if (!axis) return self.log('error', 'Move Demand: no valid axis name given')
				await sendMove(axis, Number(options.value))
			},
		},

		jog: {
			name: 'Jog Axis (at Jog Speed)',
			description:
				'Move an axis at the current Jog Speed in the chosen direction. Use on button press, with a Move Demand of 0 ' +
				'on release. The Jog presets are set up this way.',
			options: [
				...axisFields<'direction'>(),
				{
					id: 'direction',
					type: 'dropdown',
					label: 'Direction',
					default: 'forward',
					choices: [
						{ id: 'forward', label: '+ (forward)' },
						{ id: 'reverse', label: '- (reverse)' },
					],
				},
			],
			callback: async ({ options }) => {
				const axis = resolveAxis(options.axis, options.customAxis)
				if (!axis) return self.log('error', 'Jog Axis: no valid axis name given')
				await sendMove(axis, options.direction === 'reverse' ? -state.jogSpeed : state.jogSpeed)
			},
		},

		jog_speed: {
			name: 'Jog Speed',
			description:
				'Set or adjust the jog speed (%) used by the Jog Axis action. Local to Companion - sends nothing to Flair.',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					default: 'set',
					choices: [
						{ id: 'set', label: 'Set to' },
						{ id: 'adjust', label: 'Adjust by' },
					],
				},
				{
					id: 'value',
					type: 'number',
					label: 'Percent (1-100, or +/- when adjusting)',
					default: 50,
					min: -100,
					max: 100,
				},
			],
			callback: ({ options }) => {
				const pct = adjustSpeed(options.mode, Number(options.value), state.jogSpeed * 100, 1, 100)
				state.jogSpeed = pct / 100
				pushVariables(self)
			},
		},

		zero_moves: {
			name: 'Zero All Move Demands',
			description: 'Send a zero demand to every standard move axis and any custom axis Companion has moved.',
			options: noOptions(),
			callback: async () => {
				const axes = new Set<string>([...MOVE_AXES.map((a) => a.id as string), ...state.demands.keys()])
				for (const axis of axes) await sendMove(axis, 0)
			},
		},

		hhb_speed: {
			name: 'HHB Speed (0-100)',
			description: 'Set or adjust the handheld-box (HHB) speed, 0 to 100.',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					default: 'set',
					choices: [
						{ id: 'set', label: 'Set to' },
						{ id: 'adjust', label: 'Adjust by (uses last value sent)' },
					],
				},
				{
					id: 'value',
					type: 'number',
					label: 'Speed (0-100, or +/- when adjusting)',
					default: 50,
					min: -100,
					max: 100,
				},
			],
			callback: async ({ options }) => {
				const speed = adjustSpeed(options.mode, Number(options.value), state.hhbSpeed, 0, 100)
				if (await self.sendOsc('/flair/move/hhb', [{ type: 'f', value: speed }])) {
					state.hhbSpeed = speed
					pushVariables(self)
				}
			},
		},

		axis_engage: {
			name: 'Axis Engage / Disengage',
			description:
				'Engage or disengage an axis by number (numbered from 0). Toggle uses the state Companion last sent.',
			options: [
				{ id: 'axis', type: 'number', label: 'Axis number (from 0)', default: 0, min: 0, max: 255 },
				{
					id: 'state',
					type: 'dropdown',
					label: 'State',
					default: 'toggle',
					choices: [
						{ id: 'engage', label: 'Engage' },
						{ id: 'disengage', label: 'Disengage' },
						{ id: 'toggle', label: 'Toggle' },
					],
				},
			],
			callback: async ({ options }) => {
				const n = Math.trunc(options.axis)
				const engage = options.state === 'toggle' ? !state.engagedAxes.has(n) : options.state === 'engage'
				if (await self.sendOsc(engage ? '/flair/axis/engage' : '/flair/axis/disengage', [{ type: 'i', value: n }])) {
					if (engage) state.engagedAxes.add(n)
					else state.engagedAxes.delete(n)
					self.checkFeedbacks('axis_engaged')
					pushVariables(self)
				}
			},
		},

		add_line: simple('/flair/edit/addline', 'Edit: Add Line', 'Add a line to the move.'),
		delete_line: simple('/flair/edit/deleteline', 'Edit: Delete Line', 'Delete the current line.'),
		store: simple('/flair/edit/store', 'Edit: Store', 'Store the current position to the line.'),

		carts: {
			name: 'Carts Mode',
			description: 'Set the Carts control mode.',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					default: CARTS_MODES[0],
					choices: CARTS_MODES.map((m) => ({ id: m, label: m })),
				},
			],
			callback: async ({ options }) => {
				if (await self.sendOsc('/flair/control/carts', [{ type: 's', value: options.mode }])) {
					state.cartsMode = options.mode
					self.checkFeedbacks('carts_mode')
					pushVariables(self)
				}
			},
		},

		raw_osc: {
			name: 'Send Raw OSC (Advanced)',
			description: 'Send any OSC address with one optional argument - for commands not covered by the other actions.',
			options: [
				{ id: 'address', type: 'textinput', label: 'OSC address', default: '/flair/', useVariables: true },
				{
					id: 'argType',
					type: 'dropdown',
					label: 'Argument',
					default: 'none',
					disableAutoExpression: true,
					choices: [
						{ id: 'none', label: 'None' },
						{ id: 'int', label: 'Integer' },
						{ id: 'float', label: 'Float' },
						{ id: 'string', label: 'String' },
						{ id: 'true', label: 'Boolean true' },
						{ id: 'false', label: 'Boolean false' },
					],
				},
				{
					id: 'value',
					type: 'textinput',
					label: 'Value',
					default: '',
					useVariables: true,
					isVisibleExpression:
						'$(options:argType) == "int" || $(options:argType) == "float" || $(options:argType) == "string"',
				},
			],
			callback: async ({ options }) => {
				const address = options.address.trim()
				if (!address.startsWith('/')) return self.log('error', 'Send Raw OSC: address must start with "/"')
				switch (options.argType) {
					case 'none':
						await self.sendOsc(address)
						return
					case 'true':
					case 'false':
						await self.sendOsc(address, [{ type: 'b', value: options.argType === 'true' }])
						return
					case 'string':
						await self.sendOsc(address, [{ type: 's', value: options.value }])
						return
					default: {
						const n = Number(options.value)
						if (options.value.trim() === '' || !Number.isFinite(n)) {
							return self.log('error', `Send Raw OSC: "${options.value}" is not a number`)
						}
						await self.sendOsc(address, [{ type: options.argType === 'int' ? 'i' : 'f', value: n }])
					}
				}
			},
		},
	})
}
