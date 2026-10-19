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

## Shipping a PR: deploy notes

The studio owner deploys by hand. Every PR description ends with a **Deploy notes** section they can follow
step by step without asking. Write "Nothing" under a heading rather than leaving it out.

1. **Firebase.** Each step with the CLI command and where it is in the Firebase console:
   Firestore rules, Firestore indexes, Storage rules, and each Cloud Function by name
   (`firebase deploy --only functions:<name>`), plus any secret (`firebase functions:secrets:set <NAME>`)
   or data to change by hand. Say whether the order matters.
2. **Server.** Anything `server.ts` or an environment variable needs. Most `/api` routes run in the
   browser through `services/apiFetch.ts`, so say so when nothing is needed.
3. **Vercel.** Vercel builds the branch's preview, and production on merge to `main`, from GitHub by
   itself. Name any environment variable to add in Vercel → Project → Settings → Environment Variables.
4. **Google AI Studio.** The full list of files added, changed or deleted, from
   `git diff --name-only origin/main...HEAD`, grouped as app files to copy over and test files to skip.
5. **How to test it.** The steps in the app, with the role to sign in as.
