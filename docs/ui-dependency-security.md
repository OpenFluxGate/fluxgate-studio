# UI dependency security triage (2026-11-17)

Baseline: Studio PR #8, `5a85952b48c1f3a3dc5e165d86cdfe98ef18dd29`.
The full npm audit reported 18 affected dependency entries (12 high, 6 moderate),
including transitive parents, arising from three advisories. This change does not
suppress advisories, change audit thresholds, or claim a clean security gate.

## Patched dependencies

- [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5):
  constrained oversized collections can exhaust Zod memory. Update the lockfile
  from Zod 4.1.13 to 4.6.7 (patched >=4.6.6), within the existing consumer range.
  Path: eslint-config-next -> eslint-plugin-react-hooks -> zod (also used by
  zod-validation-error). These lockfile entries are development dependencies.
- [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249):
  attacker-controlled glob amplification with optimizationLevel >=2. Override
  only @typescript-eslint/typescript-estree's minimatch 9.0.9 to 11.0.1.
  The existing consumer imports the named CommonJS minimatch function and calls
  it with {dot:true} for allowDefaultProject patterns. The supported Node 22 CI
  and Docker baseline meets the new dependency engines. This is a major-version
  override, not an upstream-compatible semver update; retain lint/type/build
  regression checks and remove it once the parent toolchain adopts the fix.
  Unrelated minimatch 3.1.5 entries are outside this advisory's affected range.

## Unresolved: picomatch

[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
reports event-loop denial of service from attacker-supplied repeated-extglob
patterns (for example +(*) or +(*a)) and crafted matching strings. The advisory
lists <=4.0.7 as affected and no patched release; npm latest is 4.0.7 at review.

Affected lockfile paths, all marked dev:

- eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> picomatch 2.3.2
- vitest -> picomatch 4.0.7
- vitest -> tinyglobby (and fdir) -> picomatch 4.0.7
- vitest -> vite -> picomatch 4.0.7
- typescript-eslint -> typescript-estree -> tinyglobby -> picomatch 4.0.7
- eslint-import-resolver-typescript -> tinyglobby -> picomatch 4.0.7

The Studio application source does not directly import these packages or accept
user-supplied globs. Development/CI may process repository-controlled patterns;
that is not equivalent to proving every indirect path safe. Do not expose Vite
or test/development servers to untrusted clients. Do not use npm audit fix --force
or downgrade the test/lint frameworks merely to remove an audit finding.

## Production scope and limitations

A separate `npm audit --omit=dev` is informative only, not a replacement gate.
Next.js includes vendored compiled picomatch and Zod copies in the standalone
build, which are not represented by these transitive lockfile entries and lack
version metadata. These copies are not patched by this override. Inspected Next
image matchers compile configuration-supplied local/remote patterns, not request
URLs as patterns; this Studio config supplies neither pattern list. This is a
reachability observation, not a blanket production-security assurance. Review
upstream Next advisories and any future image/glob configuration separately.

Validation of this change: clean npm ci (lifecycle scripts disabled), lint,
format:check, typecheck, all 102 unit tests (including 10 consumer-scoped override regressions), and Next production build passed on
Node 24.22.1. Node 22 remains the remote CI compatibility check. This is a partial
remediation; unresolved picomatch findings must remain visible.

Full post-change audit: **16 high, 0 moderate**, all attributed to the remaining
picomatch advisory through its transitive parent graph. The high count is not
a count of distinct vulnerabilities; additional parent propagation replaces
some formerly moderate parent entries. Production-only audit: **0 findings**,
subject to the vendored-code limitation above. Full audit remains unsuccessful.

The normal ESLint configuration does not enable projectService/allowDefaultProject.
The dedicated dependencySecurity tests therefore resolve minimatch from the actual
typescript-estree package and exercise its named CommonJS API and {dot:true}
options with dotfiles, nested paths, braces, and extglobs. This is targeted API
coverage, not a proof of equivalence for every possible glob.
