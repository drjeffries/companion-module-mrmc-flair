# companion-module-mrmc-flair

A [Bitfocus Companion](https://bitfocus.io/companion) module for **Flair** motion control software (Multidyne Motion Control), driving it over Flair's OSC input (UDP, default port 7003). Includes ready-made presets for every OSC command.

See [HELP.md](./companion/HELP.md) for setup and usage, and [LICENSE](./LICENSE) for the license.

## Getting started

```bash
yarn            # install dependencies
yarn build      # compile TypeScript to dist/
yarn lint       # eslint + prettier
yarn dev        # tsc --watch
yarn package    # build + produce the installable .tgz via companion-module-build
```

To load the module into a local Companion instance, point Companion's "Developer modules" path at the folder that contains this one (after `yarn build`).

## Project layout

- `src/main.ts` - `ModuleInstance`: lifecycle, UDP socket (via `UDPHelper`), `sendOsc()`, and the throttled handler for Flair's incoming OSC stream.
- `src/osc.ts` - minimal OSC 1.0 encoder (int, float, string, boolean) and decoder (messages and bundles).
- `src/config.ts` - connection config (host, port, feedback listen port, default jog speed, preset counts).
- `src/actions.ts`, `src/feedbacks.ts`, `src/variables.ts`, `src/presets.ts` - the Companion-facing definitions.
- `src/state.ts` - last-sent state (Flair's OSC is one-way, so nothing is read back), axis/Carts constants.
- `src/upgrades.ts` - upgrade scripts (empty for the initial release).

## License and credits

Released under the [MIT License](./LICENSE). Copyright (c) 2026 David Jeffries.

The code was written by [Claude](https://claude.com/claude-code) (Anthropic's AI coding assistant) under David Jeffries' direction; David Jeffries is the maintainer and licensor.
