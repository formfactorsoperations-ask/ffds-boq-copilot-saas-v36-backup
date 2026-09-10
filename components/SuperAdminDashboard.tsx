/*
  The routed entry point for the platform admin screen.

  The screen itself now lives in components/admin/PlatformAdminConsole.tsx.
  This file stays so App.tsx's lazy import and the `saas-dashboard` tab keep
  working untouched; the previous 440-line implementation is replaced rather
  than extended, because almost none of what it showed was real — the platform
  health figure was the string "99.9%".
*/
export { default } from './admin/PlatformAdminConsole';
