# Working in this repository

## UI: follow DESIGN.md strictly

Every screen, panel, modal and control you add or change must follow `DESIGN.md`. That covers type
scale, colours, surfaces, controls and motion. The studio owner has asked for this explicitly:
new work must look like part of the existing app, not a new design.

- Build console screens from `ConsoleHeader`, the Studio settings rail and the `Panel` card pattern.
- Use only the existing motion classes (`hud-panel-in`, `hud-swap`, `hud-row-in`, `hud-rail-active`,
  `phd-scrim`, `phd-pop`, `CountUp`).
  People (`components/people/`) also uses the richer motion kit the owner approved: see
  "People motion" in DESIGN.md. Same fonts and colours.
- Do not use half-pixel font sizes, new accent colours or new fonts.
- Before shipping a screen, compare a screenshot of it with Studio settings.
