import type ModuleInstance from './main.js'
import { CARTS_MODES, MOVE_AXES, resolveAxis } from './state.js'

export type FeedbacksSchema = {
	trigger_on: { type: 'boolean'; options: { trigger: number } }
	axis_engaged: { type: 'boolean'; options: { axis: number } }
	carts_mode: { type: 'boolean'; options: { mode: string } }
	axis_moving: { type: 'boolean'; options: { axis: string; customAxis: string } }
	auto_browse: { type: 'boolean'; options: { direction: 'start' | 'end' } }
	receiving: { type: 'boolean'; options: Record<string, never> }
	running: { type: 'boolean'; options: Record<string, never> }
	runstate_is: { type: 'boolean'; options: { runstate: number } }
}

const ACTIVE_GREEN = 0x00aa00
const ACTIVE_ORANGE = 0xcc6600

export function UpdateFeedbacks(self: ModuleInstance): void {
	self.setFeedbackDefinitions({
		trigger_on: {
			name: 'Trigger On (as last sent)',
			description:
				'True when Companion last sent "trigger on" for this trigger. Flair reports nothing back over OSC, ' +
				'so this can drift if triggers are also changed in Flair itself.',
			type: 'boolean',
			defaultStyle: { bgcolor: ACTIVE_GREEN, color: 0xffffff },
			options: [{ id: 'trigger', type: 'number', label: 'Trigger (1+)', default: 1, min: 1, max: 999 }],
			callback: (feedback) => self.state.triggers.has(feedback.options.trigger),
		},

		axis_engaged: {
			name: 'Axis Engaged (as last sent)',
			description: 'True when Companion last sent "engage" for this axis number (from 0).',
			type: 'boolean',
			defaultStyle: { bgcolor: ACTIVE_GREEN, color: 0xffffff },
			options: [{ id: 'axis', type: 'number', label: 'Axis number (from 0)', default: 0, min: 0, max: 255 }],
			callback: (feedback) => self.state.engagedAxes.has(feedback.options.axis),
		},

		carts_mode: {
			name: 'Carts Mode (as last sent)',
			description: 'True when Companion last sent this Carts mode.',
			type: 'boolean',
			defaultStyle: { bgcolor: ACTIVE_GREEN, color: 0xffffff },
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					default: CARTS_MODES[0],
					choices: CARTS_MODES.map((m) => ({ id: m, label: m })),
				},
			],
			callback: (feedback) => self.state.cartsMode.toLowerCase() === feedback.options.mode.toLowerCase(),
		},

		axis_moving: {
			name: 'Axis Move Demand Active',
			description: 'True while a non-zero move demand is outstanding on the axis (e.g. a jog button is held).',
			type: 'boolean',
			defaultStyle: { bgcolor: ACTIVE_ORANGE, color: 0xffffff },
			options: [
				{
					id: 'axis',
					type: 'dropdown',
					label: 'Axis',
					default: 'xcam',
					disableAutoExpression: true,
					choices: [
						...MOVE_AXES.map((a) => ({ id: a.id, label: a.label })),
						{ id: 'custom', label: 'Custom axis name' },
					],
				},
				{
					id: 'customAxis',
					type: 'textinput',
					label: 'Custom axis name',
					default: '',
					isVisibleExpression: '$(options:axis) == "custom"',
				},
			],
			callback: (feedback) => {
				const axis = resolveAxis(feedback.options.axis, feedback.options.customAxis)
				return axis !== null && (self.state.demands.get(axis) ?? 0) !== 0
			},
		},

		auto_browse: {
			name: 'Auto-Browse Started (as last sent)',
			description: 'True when Companion last started auto-browse in this direction.',
			type: 'boolean',
			defaultStyle: { bgcolor: ACTIVE_ORANGE, color: 0xffffff },
			options: [
				{
					id: 'direction',
					type: 'dropdown',
					label: 'Direction',
					default: 'start',
					choices: [
						{ id: 'start', label: 'To Start' },
						{ id: 'end', label: 'To End' },
					],
				},
			],
			callback: (feedback) => self.state.autoBrowse === feedback.options.direction,
		},

		receiving: {
			name: 'Receiving Data From Flair',
			description: "True while Flair is streaming OSC to this connection's listen port (idle after 3s of silence).",
			type: 'boolean',
			defaultStyle: { bgcolor: ACTIVE_GREEN, color: 0xffffff },
			options: [],
			callback: () => self.state.receiving,
		},

		running: {
			name: 'Flair Running',
			description:
				"True while Flair reports it is running a move (/flair/running is non-zero). Needs Flair's feedback stream.",
			type: 'boolean',
			defaultStyle: { bgcolor: ACTIVE_GREEN, color: 0xffffff },
			options: [],
			callback: () => Number(self.state.incoming.get('running') ?? 0) !== 0,
		},

		runstate_is: {
			name: 'Flair Run State Equals',
			description: 'True when the raw /flair/runstate integer from Flair equals this value.',
			type: 'boolean',
			defaultStyle: { bgcolor: ACTIVE_ORANGE, color: 0xffffff },
			options: [{ id: 'runstate', type: 'number', label: 'Run state value', default: 1, min: -1000, max: 1000 }],
			callback: (feedback) => self.state.incoming.get('runstate') === feedback.options.runstate,
		},
	})
}
