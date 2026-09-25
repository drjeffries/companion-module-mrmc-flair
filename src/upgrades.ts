import type { CompanionStaticUpgradeScript } from '@companion-module/base'
import type { ModuleConfig, ModuleSecrets } from './config.js'

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig, ModuleSecrets>[] = [
	/*
	 * Place upgrade scripts here as the config/action/feedback shape evolves.
	 * Remember: once a script has shipped it cannot be removed or reordered.
	 */
]
