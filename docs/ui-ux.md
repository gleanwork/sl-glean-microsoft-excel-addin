# UI/UX Notes

The add-in should feel like a polished Office-native surface powered by Glean, not a pixel-for-pixel clone of the Glean web app.

## Principles

- Chat-first: the primary interaction is a conversational composer.
- Workbook-aware: always show which range or workbook preview is being used.
- Preview-before-write: workbook edits require a clear confirmation card by default.
- Glean-styled: use Glean brand tokens, direct copy, sentence case, and accessible controls.
- Admin-governed: keep risky capabilities such as auto-apply and workbook preview behind policy.

## Tokens

- Primary blue: `#343CED`
- Bright green: `#D8FD49`
- Oatmeal: `#F6F3EB`
- Spacing rhythm: 4px increments
- Font fallback: DM Sans, then system UI

## Required States

- First run / sign in
- Empty state with workbook-native suggestions
- Selected range context chip
- Context preview
- Thinking/progress states
- Assistant answer
- Write preview and confirmation
- Write applied result
- Auth expired
- Missing deployment config
- Admin-disabled write-back
