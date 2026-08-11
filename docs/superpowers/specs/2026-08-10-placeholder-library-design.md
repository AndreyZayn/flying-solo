# Fashion Week Placeholder Library Design

## Goal

Make every supported Fashion Week contract placeholder visible and insertable without exposing raw Markdown or changing contract rendering.

## Design

- Keep the existing `{{KEY}}` and `{{#IF KEY}}...{{/IF}}` renderer unchanged.
- Store placeholder display metadata in `config/fashion-week-placeholders.json` as the single list used by the dashboard.
- Serve that registry read-only from the local server.
- Add a compact Placeholders section directly below Payment schedule.
- Show value placeholders separately from conditional sections. Each item displays a human label, the exact token, and its current generated value or active/inactive state.
- An Insert button uses TOAST UI Editor's supported `insertText()` API at the current editor selection. Conditions insert a complete opening/closing block.
- Search filters the visible list by label, token, or description.
- The existing editor, Preview, copy behavior, template, pricing, schedules, and validation remain unchanged.

## Validation

- Reject malformed placeholder registry records on server startup.
- Verify every registry key is produced by the contract engine.
- Test the API, rendered panel, insertion code, search behavior, and existing regressions.
