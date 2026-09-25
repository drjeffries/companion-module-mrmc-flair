import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'
import type {
	CompanionPresetDefinitions,
	CompanionPresetGroup,
	CompanionPresetSection,
	CompanionSomePresetDefinition,
} from '@companion-module/base'
import { CARTS_MODES, MOVE_AXES } from './state.js'

const WHITE = 0xffffff
const BLACK = 0x000000
const DARK_GREY = 0x222222
const RED = 0xcc0000
const GREEN = 0x006600
const BLUE = 0x003d99
const AMBER = 0x995c00

type Preset = CompanionSomePresetDefinition<ModuleSchema>
type Step = Extract<Preset, { type: 'simple' }>['steps'][number]
type Feedbacks = Extract<Preset, { type: 'simple' }>['feedbacks']

interface ButtonSpec {
	name: string
	text: string
	step: Step
	bgcolor?: number
	size?: '7' | '14' | '18' | '24'
	feedbacks?: Feedbacks
}

const button = ({ name, text, step, bgcolor = DARK_GREY, size = '14', feedbacks = [] }: ButtonSpec): Preset => ({
	type: 'simple',
	name,
	style: { text, size, color: WHITE, bgcolor, show_topbar: false },
	steps: [step],
	feedbacks,
})

/**
 * Every OSC command Flair accepts has at least one ready-to-drag button here:
 *  - Run controls, auto-browse, edit commands and Carts modes - single press.
 *  - Jog buttons - hold to move at the current Jog Speed, release to send a zero demand.
 *  - Jog Speed / HHB speed - display, +/- (both carry rotate_left/rotate_right so either can go on an encoder), fixed steps.
 *  - Triggers, part-run sections and axis engage - counts come from the connection config.
 * Toggle-style buttons show what Companion last SENT: Flair reports nothing back over OSC.
 */
export function UpdatePresets(self: ModuleInstance): void {
	const label = self.label
	const { triggerCount, partSectionCount, axisCount } = self.config

	const structure: CompanionPresetSection<ModuleSchema>[] = []
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}

	/** Registers presets and returns them as a single group (or nothing if empty). */
	const section = (
		id: string,
		name: string,
		groups: { name: string; description?: string; presets: Record<string, Preset> }[],
	) => {
		const definitions: CompanionPresetGroup<ModuleSchema>[] = []
		for (const [i, g] of groups.entries()) {
			const ids = Object.keys(g.presets)
			if (ids.length === 0) continue
			Object.assign(presets, g.presets)
			definitions.push({ id: `${id}-${i}`, type: 'simple', name: g.name, description: g.description, presets: ids })
		}
		if (definitions.length > 0) structure.push({ id, name, definitions })
	}

	// --- Run controls -----------------------------------------------------------------------------
	const cmd = (
		id: string,
		text: string,
		actionId: 'stop' | 'goto_closest' | 'goto' | 'run_forward' | 'run_backward' | 'shoot',
		name: string,
		bgcolor: number,
	): [string, Preset] => [id, button({ name, text, bgcolor, step: { down: [{ actionId, options: {} }], up: [] } })]
	section('run', 'Run Controls', [
		{
			name: 'Run',
			presets: Object.fromEntries([
				cmd('run_stop', 'STOP', 'stop', 'Stop', RED),
				cmd('run_goto_closest', 'GO TO\nCLOSEST', 'goto_closest', 'Go To Closest', BLUE),
				cmd('run_goto', 'GO TO', 'goto', 'Go To', BLUE),
				cmd('run_forward', 'RUN\nFWD >>', 'run_forward', 'Run Forward', GREEN),
				cmd('run_backward', '<< RUN\nBACK', 'run_backward', 'Run Backward', GREEN),
				cmd('run_shoot', 'SHOOT', 'shoot', 'Shoot', RED),
			]),
		},
	])

	// --- Auto browse ------------------------------------------------------------------------------
	const browse = (id: string, text: string, direction: 'start' | 'end', enable: boolean): [string, Preset] => [
		id,
		button({
			name: text.replace('\n', ' '),
			text,
			bgcolor: enable ? BLUE : DARK_GREY,
			step: { down: [{ actionId: 'auto_browse', options: { direction, enable } }], up: [] },
			feedbacks: enable
				? [{ feedbackId: 'auto_browse', options: { direction }, style: { bgcolor: AMBER, color: WHITE } }]
				: [],
		}),
	]
	section('browse', 'Auto Browse', [
		{
			name: 'Auto Browse',
			description: 'Browse to the start/end of the move automatically. Lit amber while last started by Companion.',
			presets: Object.fromEntries([
				browse('browse_start', 'BROWSE\nTO START', 'start', true),
				browse('browse_end', 'BROWSE\nTO END', 'end', true),
				browse('browse_start_cancel', 'CANCEL\nBROWSE START', 'start', false),
				browse('browse_end_cancel', 'CANCEL\nBROWSE END', 'end', false),
			]),
		},
	])

	// --- Jogging ----------------------------------------------------------------------------------
	const jogGroups = MOVE_AXES.map((axis) => {
		const jog = (dir: 'forward' | 'reverse'): Preset => {
			const sign = dir === 'forward' ? '+' : '-'
			return button({
				name: `Jog ${axis.label} ${sign}`,
				text: `${axis.short}\n${sign}`,
				size: '18',
				step: {
					down: [{ actionId: 'jog', options: { axis: axis.id, customAxis: '', direction: dir } }],
					up: [{ actionId: 'move', options: { axis: axis.id, customAxis: '', value: 0 } }],
				},
				feedbacks: [
					{
						feedbackId: 'axis_moving',
						options: { axis: axis.id, customAxis: '' },
						style: { bgcolor: AMBER, color: WHITE },
					},
				],
			})
		}
		return {
			name: `Jog ${axis.label} (hold)`,
			presets: { [`jog_${axis.id}_plus`]: jog('forward'), [`jog_${axis.id}_minus`]: jog('reverse') },
		}
	})
	section('jog', 'Jog (Hold to Move)', [
		{
			name: 'Panic',
			description: 'Sends a zero demand to every move axis.',
			presets: {
				zero_moves: button({
					name: 'Zero All Moves',
					text: 'ZERO\nALL MOVES',
					bgcolor: RED,
					step: { down: [{ actionId: 'zero_moves', options: {} }], up: [] },
				}),
			},
		},
		...jogGroups,
	])

	// Jog speed / HHB speed: +/- pairs carry the same rotate actions, so either one can be dropped on an encoder.
	const jogSpeedStep = (delta: number): Preset =>
		button({
			name: `Jog Speed ${delta > 0 ? '+' : ''}${delta}%`,
			text: `JOG SPD\n${delta > 0 ? '+' : ''}${delta}\n$(${label}:jog_speed)%`,
			step: {
				down: [{ actionId: 'jog_speed', options: { mode: 'adjust', value: delta } }],
				up: [],
				rotate_left: [{ actionId: 'jog_speed', options: { mode: 'adjust', value: -Math.abs(delta) } }],
				rotate_right: [{ actionId: 'jog_speed', options: { mode: 'adjust', value: Math.abs(delta) } }],
			},
		})
	const jogSpeedSet = (pct: number): [string, Preset] => [
		`jog_speed_set_${pct}`,
		button({
			name: `Jog Speed ${pct}%`,
			text: `JOG SPD\n${pct}%`,
			step: { down: [{ actionId: 'jog_speed', options: { mode: 'set', value: pct } }], up: [] },
		}),
	]
	section('jogspeed', 'Jog Speed', [
		{
			name: 'Jog Speed',
			description: 'Local to Companion: scales the Jog buttons. Sends nothing to Flair.',
			presets: {
				jog_speed_display: button({
					name: 'Jog Speed (display)',
					text: `JOG SPEED\n$(${label}:jog_speed)%`,
					bgcolor: BLACK,
					step: { down: [], up: [] },
				}),
				jog_speed_up: jogSpeedStep(10),
				jog_speed_down: jogSpeedStep(-10),
				...Object.fromEntries([10, 25, 50, 75, 100].map(jogSpeedSet)),
			},
		},
	])

	// --- HHB speed --------------------------------------------------------------------------------
	const hhbStep = (delta: number): Preset =>
		button({
			name: `HHB Speed ${delta > 0 ? '+' : ''}${delta}`,
			text: `HHB\n${delta > 0 ? '+' : ''}${delta}\n$(${label}:hhb_speed)`,
			step: {
				down: [{ actionId: 'hhb_speed', options: { mode: 'adjust', value: delta } }],
				up: [],
				rotate_left: [{ actionId: 'hhb_speed', options: { mode: 'adjust', value: -Math.abs(delta) } }],
				rotate_right: [{ actionId: 'hhb_speed', options: { mode: 'adjust', value: Math.abs(delta) } }],
			},
		})
	const hhbSet = (speed: number): [string, Preset] => [
		`hhb_set_${speed}`,
		button({
			name: `HHB Speed ${speed}`,
			text: `HHB\n${speed}`,
			bgcolor: speed === 0 ? RED : DARK_GREY,
			step: { down: [{ actionId: 'hhb_speed', options: { mode: 'set', value: speed } }], up: [] },
		}),
	]
	section('hhb', 'HHB Speed', [
		{
			name: 'HHB Speed (0-100)',
			presets: {
				hhb_display: button({
					name: 'HHB Speed (display)',
					text: `HHB SPEED\n$(${label}:hhb_speed)`,
					bgcolor: BLACK,
					step: { down: [], up: [] },
				}),
				hhb_up: hhbStep(10),
				hhb_down: hhbStep(-10),
				...Object.fromEntries([0, 25, 50, 75, 100].map(hhbSet)),
			},
		},
	])

	// --- Triggers ---------------------------------------------------------------------------------
	const range = (n: number, from = 1): number[] => Array.from({ length: Math.max(0, n) }, (_, i) => i + from)
	const triggerPreset = (n: number, state: 'on' | 'off' | 'toggle'): Preset =>
		button({
			name: `Trigger ${n} ${state}`,
			text: state === 'toggle' ? `TRIG ${n}` : `TRIG ${n}\n${state.toUpperCase()}`,
			step: { down: [{ actionId: 'trigger', options: { trigger: n, state } }], up: [] },
			feedbacks:
				state === 'off'
					? []
					: [{ feedbackId: 'trigger_on', options: { trigger: n }, style: { bgcolor: GREEN, color: WHITE } }],
		})
	section('triggers', 'Triggers', [
		{
			name: 'Toggle',
			description: 'Toggles based on what Companion last sent. Lit green while on.',
			presets: Object.fromEntries(range(triggerCount).map((n) => [`trigger_toggle_${n}`, triggerPreset(n, 'toggle')])),
		},
		{
			name: 'On',
			presets: Object.fromEntries(range(triggerCount).map((n) => [`trigger_on_${n}`, triggerPreset(n, 'on')])),
		},
		{
			name: 'Off',
			presets: Object.fromEntries(range(triggerCount).map((n) => [`trigger_off_${n}`, triggerPreset(n, 'off')])),
		},
	])

	// --- Part-run sections ------------------------------------------------------------------------
	const partPreset = (n: number, run: boolean): Preset =>
		button({
			name: `${run ? 'Run' : 'Prepare'} Part Section ${n}`,
			text: run ? `RUN\nPART ${n}` : `PREP\nPART ${n}`,
			bgcolor: run ? GREEN : BLUE,
			step: {
				down: [{ actionId: run ? 'run_part_section' : 'prepare_part_section', options: { section: n } }],
				up: [],
			},
		})
	section('parts', 'Part-Run Sections', [
		{
			name: 'Prepare',
			presets: Object.fromEntries(range(partSectionCount).map((n) => [`part_prepare_${n}`, partPreset(n, false)])),
		},
		{
			name: 'Prepare & Run',
			presets: Object.fromEntries(range(partSectionCount).map((n) => [`part_run_${n}`, partPreset(n, true)])),
		},
	])

	// --- Axis engage ------------------------------------------------------------------------------
	const axisPreset = (n: number, state: 'engage' | 'disengage' | 'toggle'): Preset =>
		button({
			name: `Axis ${n} ${state}`,
			text: state === 'toggle' ? `AXIS ${n}` : `AXIS ${n}\n${state === 'engage' ? 'ENGAGE' : 'DISENG.'}`,
			step: { down: [{ actionId: 'axis_engage', options: { axis: n, state } }], up: [] },
			feedbacks:
				state === 'disengage'
					? []
					: [{ feedbackId: 'axis_engaged', options: { axis: n }, style: { bgcolor: GREEN, color: WHITE } }],
		})
	section('axes', 'Axis Engage (numbered from 0)', [
		{
			name: 'Toggle',
			description: 'Toggles based on what Companion last sent. Lit green while engaged.',
			presets: Object.fromEntries(range(axisCount, 0).map((n) => [`axis_toggle_${n}`, axisPreset(n, 'toggle')])),
		},
		{
			name: 'Engage',
			presets: Object.fromEntries(range(axisCount, 0).map((n) => [`axis_engage_${n}`, axisPreset(n, 'engage')])),
		},
		{
			name: 'Disengage',
			presets: Object.fromEntries(range(axisCount, 0).map((n) => [`axis_disengage_${n}`, axisPreset(n, 'disengage')])),
		},
	])

	// --- Carts ------------------------------------------------------------------------------------
	section('carts', 'Carts Mode', [
		{
			name: 'Carts Mode',
			description: 'Lit green for the mode Companion last sent.',
			presets: Object.fromEntries(
				CARTS_MODES.map((mode) => [
					`carts_${mode.toLowerCase().replace(/\s+/g, '_')}`,
					button({
						name: mode,
						text: mode.replace(' ', '\n'),
						step: { down: [{ actionId: 'carts', options: { mode } }], up: [] },
						feedbacks: [{ feedbackId: 'carts_mode', options: { mode }, style: { bgcolor: GREEN, color: WHITE } }],
					}),
				]),
			),
		},
	])

	// --- Edit -------------------------------------------------------------------------------------
	const edit = (
		id: string,
		text: string,
		actionId: 'add_line' | 'delete_line' | 'store',
		name: string,
		bgcolor = DARK_GREY,
	): [string, Preset] => [id, button({ name, text, bgcolor, step: { down: [{ actionId, options: {} }], up: [] } })]
	section('edit', 'Edit', [
		{
			name: 'Edit',
			presets: Object.fromEntries([
				edit('edit_add_line', 'ADD\nLINE', 'add_line', 'Add Line', BLUE),
				edit('edit_delete_line', 'DELETE\nLINE', 'delete_line', 'Delete Line', RED),
				edit('edit_store', 'STORE', 'store', 'Store', GREEN),
			]),
		},
	])

	// --- Live readouts (Flair's OSC feedback stream) ------------------------------------------------
	const readout = (id: string, title: string, size: '14' | '18' = '14'): [string, Preset] => [
		`readout_${id}`,
		button({
			name: `${title} (readout)`,
			text: `${title}\n$(${label}:${id})`,
			bgcolor: BLACK,
			size,
			step: { down: [], up: [] },
		}),
	]
	section('readouts', 'Live Readouts (from Flair)', [
		{
			name: 'Status',
			description: "Needs Flair's OSC output pointed at this connection's listen port.",
			presets: {
				...Object.fromEntries([
					readout('runstate', 'RUN STATE'),
					readout('frame', 'FRAME'),
					readout('framef', 'FRAME F'),
				]),
				readout_running: button({
					name: 'Running (readout)',
					text: 'RUNNING',
					bgcolor: BLACK,
					step: { down: [], up: [] },
					feedbacks: [{ feedbackId: 'running', options: {}, style: { bgcolor: GREEN, color: WHITE } }],
				}),
				readout_receiving: button({
					name: 'Receiving (readout)',
					text: 'FLAIR\nFEEDBACK',
					bgcolor: BLACK,
					step: { down: [], up: [] },
					feedbacks: [{ feedbackId: 'receiving', options: {}, style: { bgcolor: GREEN, color: WHITE } }],
				}),
			},
		},
		{
			name: 'Camera',
			presets: Object.fromEntries([
				readout('camx', 'CAM X'),
				readout('camy', 'CAM Y'),
				readout('camz', 'CAM Z'),
				readout('pan', 'PAN'),
				readout('tilt', 'TILT'),
				readout('roll', 'ROLL'),
			]),
		},
		{
			name: 'Target',
			presets: Object.fromEntries([readout('targx', 'TARG X'), readout('targy', 'TARG Y'), readout('targz', 'TARG Z')]),
		},
		{
			name: 'Lens',
			presets: Object.fromEntries([
				readout('zoom', 'ZOOM'),
				readout('focus', 'FOCUS'),
				readout('focusraw', 'FOCUS RAW'),
				readout('fstop', 'F-STOP'),
			]),
		},
	])

	// --- Utilities --------------------------------------------------------------------------------
	section('utilities', 'Utilities', [
		{
			name: 'Info',
			presets: {
				info_target: button({
					name: 'Target (info only)',
					text: `FLAIR\n$(${label}:target)`,
					bgcolor: BLACK,
					size: '14',
					step: { down: [], up: [] },
				}),
				info_last_message: button({
					name: 'Last OSC Sent (info only)',
					text: `LAST SENT\n$(${label}:last_message)`,
					bgcolor: BLACK,
					size: '7',
					step: { down: [], up: [] },
				}),
			},
		},
	])

	self.setPresetDefinitions(structure, presets)
}
