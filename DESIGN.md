# Design

## Source of truth
- Status: Active candidate, not production approved. Refreshed 2026-11-18.
- Surface: authenticated rule-management console, based on main34b03a and Next patch a214ce8.
- Evidence: AdminDashboard, RuleCard, StatCard, RuleFormPanel, globals.css and independent 360/1280 screenshot review. No existing design brief found.
## Brand
Precise, quiet operational tooling. Trust comes from real data, legible state and predictable controls. Avoid decorative telemetry, mock health, gradient-heavy marketing UI.
## Product goals
Find and safely inspect/edit rules quickly. Compact summary and aligned rows, not a monitoring product. Success: readable identifiers, visible actions, usable narrow screens, keyboard operability. No invented metrics.
## Personas and jobs
Operators managing limits and rule sets; scan status/capacity, search, edit, simulate, import/export. Desktop operations and mobile inspection.
## Information architecture
Existing single screen only. Overview and rules anchor navigation. Summary → search/actions → rule inventory. No dead navigation links or unsupported screens.
## Design principles
Density with clarity: desktop rows, mobile cards. Identity before decoration. Explicit enabled/disabled text. Preserve backend contracts and handlers.
## Visual language
Neutral surfaces, existing blue accent and theme tokens. System fonts, monospace IDs, tabular values; 4/8px spacing rhythm; restrained 4–8px radius and borders. Lucide icons support text; reduced motion respected.
## Components
Reuse themes, badges, cards and form. Compact summary strip; aligned desktop rule columns; labeled actions; native modal dialog for New/Edit. Native browser focus containment and Escape replace bespoke modal semantics.
## Accessibility
Target WCAG2.2AA, not certified. Explicit names and status text, focus outlines, native modal focus return/inert background, live error/status text. Contrast and keyboard must be independently checked. No color-only state.
## Responsive behavior
360/390/768/1280px checks. Full names wrap on mobile. Desktop rows align at1200px; narrow screens stack metadata/actions. Modal heading remains visible and body scrolls.
## Interaction states
Initial loading has status text. Refresh does not erase data. Empty search offers clear search, empty inventory offers create. Error is alert; success is status. Existing API failures remain visible.
## Content voice
Short operational language. Data timestamp is not service health. No unsupported claims or numeric design score.
## Implementation constraints
Next16.4.6/React19, existing Tailwind tokens. No API/auth/DB/route/workflow/dependency changes. All data handlers retained. npm lint/typecheck/test/build plus independent wire/browser tests and screenshots required.
## Open questions
- [ ] Full accessibility audit and production-auth integration remain separate validation.
- [ ] Existing simulation fallback is inherited behavior, not changed by design work.
