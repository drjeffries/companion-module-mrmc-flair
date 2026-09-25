# Multidyne Flair

Controls **Flair** motion control software over its built-in **OSC input** (UDP).

## Enabling OSC in Flair

In Flair's `.ini` file make sure these are set (the documentation for them conflicts between versions, so check all three):

```
FlairOscServer=1
FlairOscPort=7003
OscServer=1
```

Then enter the Flair PC's IP address and the port (default `7003`) in this connection's settings.

## Feedback from Flair (variables)

Flair streams its live state out over OSC (about 50 times a second). To receive it, point Flair's OSC output at **this computer's IP address and the Feedback Listen Port** from this connection's settings (default `7004`; `0` turns listening off). Commands are sent from that same port, so a Flair that replies to the sender will also reach it.

Each value becomes a variable of the same name:

| Variable                                 | From                                                     |
| ---------------------------------------- | -------------------------------------------------------- |
| `camx` `camy` `camz` `pan` `tilt` `roll` | `/flair/camx` ... `/flair/roll` (camera position/angles) |
| `targx` `targy` `targz`                  | `/flair/targx` ... `/flair/targz` (target position)      |
| `zoom` `focus` `focusraw` `fstop`        | lens values                                              |
| `frame` `framef`                         | current frame (integer / fractional)                     |
| `runstate` `running` `triggers`          | raw integers from Flair                                  |
| `osc_in`                                 | `receiving`, `idle` (no data for 3s) or `off`            |

Values are rounded to 3 decimal places and updated at most every 100 ms. `runstate` and `triggers` are shown exactly as Flair sends them; this module does not interpret them. Any other `/flair/<name>` value Flair sends (for example a named axis) gets a variable of that name automatically, up to 200 of them.

Feedbacks: **Receiving Data From Flair**, **Flair Running** (`running` is non-zero) and **Flair Run State Equals**. The Presets tab has a **Live Readouts** section with a button for each value.

## One-way commands

OSC over UDP is fire-and-forget. Companion cannot tell whether Flair received a command, and the incoming stream above carries state, not acknowledgements. The connection status only means the socket is ready to send. Buttons that light up (triggers, axis engage, Carts mode, auto-browse) show what **Companion last sent**, and can drift if the same thing is changed in Flair directly. Every toggle therefore has explicit On/Off (or Engage/Disengage) presets too.

Flair's OSC has no authentication: use a trusted network only.

## Actions

| Action                                     | OSC address                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Stop / Go To Closest / Go To               | `/flair/command/stop`, `gotoclosest`, `goto`                                                               |
| Run Forward / Run Backward / Shoot         | `/flair/command/fwdrun`, `backrun`, `shoot`                                                                |
| Auto Browse To Start / End                 | `/flair/command/browsestart`, `browseend` (boolean; untick "Enable" to send false)                         |
| Trigger On / Off / Toggle                  | `/flair/command/trigon`, `trigoff` (integer, from 1)                                                       |
| Prepare Part-Run Section / Prepare & Run   | `/flair/command/partsection`, `runpartsection` (integer, from 1)                                           |
| Move Demand                                | `/flair/move/<axis>` (float -1.0 to 1.0): browse, xcam, ycam, zcam, pan, tilt, roll, or a custom axis name |
| HHB Speed                                  | `/flair/move/hhb` (0 to 100)                                                                               |
| Axis Engage / Disengage / Toggle           | `/flair/axis/engage`, `disengage` (integer axis number, from 0)                                            |
| Edit: Add Line / Delete Line / Store       | `/flair/edit/addline`, `deleteline`, `store`                                                               |
| Carts Mode                                 | `/flair/control/carts` (string, e.g. `Locked World`)                                                       |
| Send Raw OSC                               | any address, with an optional int / float / string / boolean argument                                      |
| Jog Axis, Jog Speed, Zero All Move Demands | helpers built on Move Demand (see below)                                                                   |

## Jogging

A move demand **holds until changed**, so a jog button sends a demand on press and a zero on release. The **Jog Axis** action moves an axis at the current **Jog Speed** (a percentage local to Companion, set in the connection config and adjustable from buttons or an encoder). The Jog presets are wired this way for every axis, in both directions.

Disconnecting or reconfiguring the module sends a zero demand to any axis left moving (configurable). **Zero All Moves** is provided as a panic button.

## Presets

The Presets tab has a button for every command, in sections: Run Controls, Auto Browse, Jog (hold to move), Jog Speed, HHB Speed, Triggers, Part-Run Sections, Axis Engage, Carts Mode, Edit and Utilities. The number of trigger, part-run-section and axis buttons generated is set in the connection config.

Jog Speed and HHB Speed +/- buttons also carry rotate actions, so either one can be dropped on a Stream Deck+ dial.

## Variables

Besides the Flair feedback variables above: `jog_speed`, `hhb_speed`, `carts_mode`, `auto_browse`, `active_triggers`, `engaged_axes`, `moving_axes`, `last_message`, `last_error`, `target`.
