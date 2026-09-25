import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	port: number
	listenPort: number
	jogSpeed: number
	triggerCount: number
	partSectionCount: number
	axisCount: number
	zeroOnDestroy: boolean
}

/** Flair's OSC input has no authentication, so this module has no secret fields. */
export type ModuleSecrets = Record<string, never>

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info-about',
			width: 12,
			label: 'About',
			value:
				"Sends OSC over UDP to the OSC server built into Flair. In Flair's .ini file set FlairOscServer=1, " +
				'OscServer=1 and FlairOscPort=7003 (default). OSC over UDP is one-way and unacknowledged, so ' +
				'Companion cannot tell whether Flair received a command - button feedback shows what Companion last ' +
				"sent, not what Flair is doing. Flair's OSC has no authentication: use a trusted network only.",
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Flair PC Host / IP',
			width: 6,
			default: '127.0.0.1',
			regex: Regex.HOSTNAME,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Flair OSC Port (UDP)',
			width: 6,
			default: 7003,
			min: 1,
			max: 65535,
			tooltip: 'The FlairOscPort value in the Flair ini file. Default 7003.',
		},
		{
			type: 'number',
			id: 'listenPort',
			label: 'Feedback Listen Port (UDP, 0 = off)',
			width: 12,
			default: 7004,
			min: 0,
			max: 65535,
			tooltip:
				'Flair streams its live state (camera position, pan/tilt/roll, zoom, focus, frame, run state...) as OSC. ' +
				"Point Flair's OSC output at this computer's IP and this port, and it appears as variables. " +
				'Commands are also sent from this port, so a Flair that replies to the sender will reach it too. ' +
				'Set 0 to send only.',
		},
		{
			type: 'number',
			id: 'jogSpeed',
			label: 'Default Jog Speed (%)',
			width: 6,
			default: 50,
			min: 1,
			max: 100,
			tooltip:
				'Initial value of the jog speed used by the Jog presets (share of full axis demand, 1-100%). ' +
				'Can be changed live from buttons.',
		},
		{
			type: 'checkbox',
			id: 'zeroOnDestroy',
			label: 'Zero Moving Axes on Disconnect',
			width: 6,
			default: true,
			tooltip:
				'When the connection is removed, disabled or its settings change, send a zero move demand to any ' +
				'axis Companion left moving, so a held jog cannot run away.',
		},
		{
			type: 'number',
			id: 'triggerCount',
			label: 'Trigger Presets (count)',
			width: 4,
			default: 16,
			min: 0,
			max: 64,
			tooltip: 'How many trigger buttons (1..N) to generate in the Presets tab.',
		},
		{
			type: 'number',
			id: 'partSectionCount',
			label: 'Part-Run Section Presets (count)',
			width: 4,
			default: 8,
			min: 0,
			max: 64,
			tooltip: 'How many part-run section buttons (1..N) to generate in the Presets tab.',
		},
		{
			type: 'number',
			id: 'axisCount',
			label: 'Axis Engage Presets (count)',
			width: 4,
			default: 8,
			min: 0,
			max: 64,
			tooltip: 'How many axis engage/disengage buttons (axis 0..N-1) to generate in the Presets tab.',
		},
	]
}
