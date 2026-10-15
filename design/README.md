# Foundry design catalogue — development foundation

This PR installs a catalogue, not an approved replacement design or a production
release. The actual `Travel` component and shared `Button` are rendered with
fictional props. No app routes, application components, production CSS, database
or deployment settings are changed.

## Run

Use Node 22 (22.18+ recommended), then:

```sh
npm ci
npm run tokens:build
npm run tokens:check
npm run storybook
```

Open http://localhost:6006/?path=/story/travel-existing-portal--example .
Choose **Empty** for the empty Travel state, or Components / Button for existing
primary, secondary and disabled variants. Existing Travel UI actions may change
local state; fetch requests return an explicit 403 and cannot save anything.
Never enter real data or credentials into Storybook. The preview CSP blocks
external connections and form submissions. Fonts are bundled locally.

## Build and check

```sh
npm run build-storybook
npx tsc --noEmit
npx eslint .storybook stories scripts tests/design playwright.design.config.ts
npx playwright install chromium
npm run test:design
```

The PR workflow runs these checks on Ubuntu. The browser smoke checks open the
fictional trip, inspect the empty state and disabled button, and verify blocked
API traffic. They are not full Travel acceptance tests or approved visual goldens.
The accessibility addon reports findings, but is explicitly non-gating while
existing component findings are unresolved. CI passing is not design approval.

## Tokens and authority

`design/tokens/foundry.json` captures existing brand/canvas colors from
`app/globals.css`, the existing Poppins family, and card spacing/radius from
`components/ui/Stat.tsx`. Style Dictionary generates committed CSS and flat JSON
under `design/generated`. The color check prevents divergence from production
CSS during this staged introduction. Storybook imports generated colors; production
continues using its existing stylesheet until a reviewed adoption change.

Edit token source, run generation, review both outputs, then commit them together.
Never edit generated files directly. Generated output must reproduce without a
Git diff. These files are a recovered baseline candidate, not an approval record.
Portal Poppins does not replace the separate approved Arial calendar format.

## Versions and next steps

Exact tool versions are in package.json/package-lock.json. Application version
remains 0.1.0; adding tools does not establish Travel v1.0.0 or any production
release. The next increment should capture Jacob's approved reference screens,
add visual goldens and native Outlook/PDF evidence, fix accessibility findings,
and configure required checks with independent approval. No Chromatic service,
new paid seat, AI calls, production credentials or deployment automation is added.
Branch protection is not configured by this PR.

## Validation and known limitations

Local token checks, TypeScript, scoped ESLint, Storybook build and Next production
build passed. Local Playwright browser launch was blocked by the macOS execution
sandbox; browser smoke tests must pass in GitHub CI before merge. The in-app
browser rendered the real Travel screen with the fictional fixture.

Storybook's accessibility scan of the unchanged Travel list reported color
contrast violations (5 nodes) and one empty table header. These are visible
follow-up findings, not silently waived release requirements. Fixed-date test
fixtures use 2030; the interactive catalogue uses the real browser clock.

The same-session npm audit reported 15 advisories on the baseline lockfile and
13 after installation (1 moderate, 11 high, 1 critical), with no new affected
package names. Existing vulnerabilities remain; this PR is not a security fix.
Eight existing transitive packages were updated by dependency resolution; all
application direct dependencies remain unchanged. Reassess advisories before
release. No automatic audit-fix or major application upgrade was performed.
