# `public/landing/` — the marketing page, embedded

This is the Course Forge landing page, served as a static file at `/landing/index.html`
and shown inside a full-screen iframe by `src/components/LandingModal.jsx`.

## Why an iframe and not a React component

The page ships its own design system (`_ds/modernist-…/styles.css`): Archivo from Google
Fonts, a `--color-*` token set, and `html[data-theme="dark"]` for dark mode. The app runs
Tailwind v4 with a `.dark` class and its own tokens of the same names. Porting the markup
into JSX would put those two systems in one document and they would fight — preflight
resets, clashing custom properties, duplicate `--color-surface`. A separate document costs
one iframe and keeps both intact.

Everything here lives in `public/`, so Vite copies it to `dist/` verbatim — no bundling,
no imports, nothing for the build to break.

## Source of truth

Authored in `Course Forge Landing Page/` at the workspace root (one level above the repo).
That folder is *not* checked in; this copy is.

**Files copied:** `index.html`, `ds-base.js`, `_ds/modernist-9bc29959-…/{styles.css,_ds_bundle.js}`.

**Deliberately not copied:** `uploads/` (1.9 MB of screenshots nothing references),
`github.md` (authoring notes), `image-slot.js` (see edit 1), and `assets/photo.jpg`
— the photograph it held was replaced by the principle quote in edit 7.

`ds-base.js` resolves `_ds/…` relative to the document, so keep the folder layout as-is.

## Re-syncing after the landing page changes

Copy the four files above over this folder, then re-apply the seven edits below. Each is
marked in `index.html` with a `CF-EMBED` comment, so `grep -n CF-EMBED index.html` finds
all of them. Nothing else in the page was touched.

### Edit 1/7 — drop `image-slot.js`

`<image-slot>` is a 65 KB authoring component that fetches an `.image-slots.state.json`
sidecar (404 outside its design tool) to render one static JPEG. Replaced with a plain
`<img>`, and the CSS rule `.split-figure image-slot` became `.split-figure img` with
`object-fit: cover` to keep the same 951×665 crop. The `<script src="image-slot.js">` tag
is gone.

### Edit 2/7 — theme sync

Appended script reads `?theme=light|dark` on load and listens for a `cf-theme`
`postMessage` from the parent, so toggling the app's Sun/Moon button updates the embedded
page live. Under `?embed=1` the page's own theme toggle is hidden — the app owns the theme
in that context.

Note the two theme keys are intentionally different: the app stores `cf_theme`
(underscore), this page stores `cf-theme` (hyphen). Embedding never writes over the app's
choice.

### Edit 3/7 — wire the dead CTAs

The four "Create free account" / "Generate my first path" / "Start with your goal" buttons
are inert `<button type="button">` in the standalone page. Under `?embed=1` each one
posts `{type:'cf-landing-close'}` to the parent, so clicking a call-to-action dismisses
the modal and drops the user on the actual form. The `See how it works` link is an
in-page anchor and is left alone.

### Edit 4/7 — repalette to the logo

The page shipped with a near-mono ink and a blue accent. Its `:root` and
`html[data-theme="dark"]` blocks now carry the CourseForge palette instead —
forge navy `#0B1B2B` and ember `#FF8900`, the two colours sampled out of the
logo artwork. Same token names, same structure, only the values changed, so
none of the page's components were restyled by hand.

The ember ramp holds the logo's 32° hue and walks lightness; step 500 lands
exactly on `#FF8900`. The `.kicker` rule moved from `accent-700` to
`accent-800`, because that 13px uppercase label wants the ~6.4:1 the page's own
comment asks for and `accent-700` only reaches 4.55:1.

### Edit 5/7 — headings on the brand face

`--font-heading` is overridden to **Chakra Petch**, matching the app and the
logo's own letterforms, with a `<link>` for the webfont. Body copy deliberately
stays on **Archivo**: this page's rhythm (28px leading, cap-trimmed heads) is
tuned to it, and it reads better at 17px than a squared display face would.

The `-0.058em` optical left-alignment on `.display` and `.close h3` was measured
for Archivo 800. Chakra Petch's flat-sided caps don't need it, so it's zeroed.

### Edit 6/7 — the nav is removed

The page only ever appears inside the app's modal, which brings its own chrome
(Close / Do not show again). A second brand bar plus a row of in-page anchors was
duplicate furniture, so `<nav class="nav">` is gone and the page opens on the hero.

The theme toggle lived in that nav, so the foot-of-page script now uses
`getElementById('theme-toggle')?.addEventListener(...)` — without the `?` it throws
and takes the rest of that script with it.

### Edit 7/7 — the quote replaces the photograph

`.split`'s right-hand column held a grayscale photo, with the principle quote in its
own full-width section below. The quote now occupies that column and the standalone
section is gone, along with its vertical space.

The figure keeps the `quote` class so the shared `.quote blockquote` /
`.quote figcaption` rules — including the hanging punctuation — still apply; a
`.split-quote` class zeroes the section padding those rules assumed. The mobile rule
`.split-figure { order: -1 }` was dropped too: it pulled the photo above the copy,
and a quote read before the heading it belongs to makes no sense.

Brand strings on the page were also unified from "Course Forge" to **CourseForge**,
matching the logo wordmark and the app.

## Standalone behaviour is unchanged

Without `?embed=1` the added script does nothing beyond honouring an explicit `?theme=`.
Open `/landing/index.html` directly and you get the page as authored — minus the nav
and the photograph, which are now removed for every context, not just the embed.
