import type { CompanionVariableValue } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { INCOMING_VARIABLES } from './state.js'

export type VariablesSchema = Record<string, CompanionVariableValue>

/** Ids used by this module's own state; incoming Flair values with the same name get an "osc_" prefix. */
export const INTERNAL_VARIABLES: Record<string, string> = {
	target: 'Flair host:port being controlled',
	jog_speed: 'Jog speed (%) used by jog buttons',
	hhb_speed: 'HHB speed (0-100) last sent',
	carts_mode: 'Carts mode last sent',
	auto_browse: 'Auto-browse direction last started (start/end/none)',
	active_triggers: 'Triggers last turned on (comma-separated)',
	engaged_axes: 'Axes last engaged (comma-separated, from 0)',
	moving_axes: 'Axes with a non-zero move demand outstanding',
	last_message: 'Last OSC message sent',
	last_error: 'Last send error, if any',
	osc_in: 'Feedback from Flair (receiving / idle / off)',
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const definitions: Record<string, { name: string }> = {}
	for (const [id, name] of Object.entries(INTERNAL_VARIABLES)) definitions[id] = { name }
	for (const [id, name] of Object.entries(INCOMING_VARIABLES)) definitions[id] = { name: `Flair: ${name}` }
	for (const [id, name] of self.state.dynamicVariables) definitions[id] = { name }
	self.setVariableDefinitions(definitions)
	pushVariables(self)
}

const sortedList = (values: Iterable<number>): string => [...values].sort((a, b) => a - b).join(', ')

export function pushVariables(self: ModuleInstance): void {
	const s = self.state
	self.setVariableValues({
		target: `${self.config.host}:${self.config.port}`,
		jog_speed: Math.round(s.jogSpeed * 100),
		hhb_speed: s.hhbSpeed,
		carts_mode: s.cartsMode || 'unknown',
		auto_browse: s.autoBrowse || 'none',
		active_triggers: sortedList(s.triggers),
		engaged_axes: sortedList(s.engagedAxes),
		moving_axes: s.movingAxes().join(', '),
		last_message: s.lastMessage,
		last_error: s.lastError,
		osc_in: self.config.listenPort === 0 ? 'off' : s.receiving ? 'receiving' : 'idle',
	})
}
