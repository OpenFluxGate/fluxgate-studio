# Operations dashboard evaluation (0.5.0 development)

Baseline: PR #8, 1419b4cc43035ebdfbbdc1118c7a1193ac33aa7b.
This first pass improves correctness and small-screen structure; it is not a 95/100 certification.

## Scoring rubric and release gate
- Data integrity and scope clarity: 25 points.
- Operational hierarchy and drilldown: 20 points.
- Loading, empty, stale and error recovery: 15 points.
- Keyboard, screen reader and contrast accessibility: 15 points.
- Mobile and responsive layouts: 15 points.
- Regression evidence, English/Korean and performance: 10 points.

95/100 is the target, not an observed result. Unverified criteria cannot earn points. Production publication requires separate approval and is not authorized by this document.

## Changes in this pass
- A previous count of zero no longer produces a fabricated 0% change when traffic becomes positive.
- Reject-rate comparison treats an empty previous window as unavailable.
- Global active-rule counts are explicitly labelled as current, global configuration rather than filtered telemetry.
- SWR retains data on same-key refresh failures but no longer carries another filter/time range's values into the newly selected range. The success timestamp is tied to the request key.
- Overview panels explicitly show stale-refresh warnings while preserving their last successful values.
- On narrow screens navigation becomes an icon rail with accessible link names. The desktop collapse preference remains unchanged.
- The header wraps controls on narrow screens; summary cards use one column before the small breakpoint. Dynamic viewport height avoids browser-chrome clipping.

## Evidence and limitations
The relevant installed Next.js client-component guide was read. Changes preserve API calls, role-based visibility, English/Korean messages and existing themes. Unit tests cover zero-baseline comparisons and invalid counts. Existing CI must validate lint, formatting, types, unit tests and production build on the exact new head.

No browser or mobile visual run has been performed for this change because the execution environment is read-only. Code inspection is not a substitute for screenshots, keyboard testing or assistive-technology review. Neither a passing unit suite nor this rubric establishes a measured UI score.

## Required browser matrix before claiming 95+
- 360, 390, 768, 1280 and 1920px; both themes and locales.
- Viewer/admin; monitoring, rules, keys, activity, settings.
- Initial loading; genuine empty data; failure before data; failure after data; retry recovery.
- Change time/rule-set filters during pending requests; ensure no old-scope metrics appear.
- Keyboard navigation, focus visibility/return, modal close/Back, panel menus, chart data-table alternative.
- Long rule identifiers, large counts, narrow tables, 200% zoom, reduced motion.
- Same-key refresh failure and recovery; confirm each stale panel is labelled.
- Confirm policy editing and confirmation flows remain unchanged.

## Compatibility
This UI pass does not change storage, indexes, TTL or backend API contracts. It does not certify 0.3.x/0.5.0 mixed writers as safe. Existing ACL-loss, identity and rollback caveats still apply.
