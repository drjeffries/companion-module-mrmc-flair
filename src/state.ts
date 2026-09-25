/** Flair's OSC input is one-way, so this is the last state Companion *sent*, not confirmed Flair state. */

export const CARTS_MODES = [
	'Carts Off',
	'Carts World',
	'Locked World',
	'Carts View',
	'Locked View',
	'Carts Roll',
	'Locked Roll',
	'Carts Up',
	'Locked Up',
	'Locked Flat',
] as const

/** Axes with a fixed OSC address in Flair. Any other named axis is reachable via the "custom" choice. */
export const MOVE_AXES = [
	{ id: 'browse', label: 'Browse', short: 'BROWSE' },
	{ id: 'xcam', label: 'X Cam', short: 'X' },
	{ id: 'ycam', label: 'Y Cam', short: 'Y' },
	{ id: 'zcam', label: 'Z Cam', short: 'Z' },
	{ id: 'pan', label: 'Pan', short: 'PAN' },
	{ id: 'tilt', label: 'Tilt', short: 'TILT' },
	{ id: 'roll', label: 'Roll', short: 'ROLL' },
] as const

/** Resolves the axis dropdown + custom-name field to an OSC axis name, or null if the name is unusable. */
export function resolveAxis(axis: string, customAxis: string): string | null {
	const name = axis === 'custom' ? customAxis.trim() : axis
	// The name becomes an OSC address path segment, so reject anything that would break the address.
	if (name === '' || /[\s/#*,?[\]{}]/.test(name)) return null
	return name
}

/** Values Flair streams out as /flair/<name>, mapped to a variable of the same id. */
export const INCOMING_VARIABLES: Record<string, string> = {
	camx: 'Camera X position',
	camy: 'Camera Y position',
	camz: 'Camera Z position',
	pan: 'Camera pan',
	tilt: 'Camera tilt',
	roll: 'Camera roll',
	targx: 'Target X position',
	targy: 'Target Y position',
	targz: 'Target Z position',
	zoom: 'Zoom',
	focus: 'Focus',
	focusraw: 'Focus (raw)',
	fstop: 'F-stop',
	frame: 'Frame',
	framef: 'Frame (fractional)',
	runstate: 'Run state (raw integer from Flair)',
	running: 'Running (raw integer from Flair, 0 = not running)',
	triggers: 'Triggers (raw integer from Flair)',
}

/** Give up creating variables for unknown addresses past this many, in case Flair sends something unbounded. */
export const MAX_DYNAMIC_VARIABLES = 200

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

export class ModuleState {
	/** Jog speed as a 0.01-1.0 share of full demand. */
	jogSpeed = 0.5
	/** HHB speed, 0-100. */
	hhbSpeed = 0
	cartsMode = ''
	autoBrowse: '' | 'start' | 'end' = ''
	readonly triggers = new Set<number>()
	readonly engagedAxes = new Set<number>()
	/** Last move demand sent per axis name (-1.0..1.0). */
	readonly demands = new Map<string, number>()
	lastMessage = ''
	lastError = ''
	/** Latest value received from Flair per variable id (rounded), used to skip unchanged values. */
	readonly incoming = new Map<string, number | string>()
	/** Variables created on the fly for /flair/<name> addresses not in INCOMING_VARIABLES. */
	readonly dynamicVariables = new Map<string, string>()
	receiving = false

	/** Axis names with a non-zero demand outstanding. */
	movingAxes(): string[] {
		return [...this.demands.entries()].filter(([, v]) => v !== 0).map(([k]) => k)
	}

	reset(): void {
		this.hhbSpeed = 0
		this.cartsMode = ''
		this.autoBrowse = ''
		this.triggers.clear()
		this.engagedAxes.clear()
		this.demands.clear()
		this.lastMessage = ''
		this.lastError = ''
		this.incoming.clear()
		this.dynamicVariables.clear()
		this.receiving = false
	}
}
