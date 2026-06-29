# Optiyou Brand Identity

**Canonical reference for all visual and verbal brand decisions.** Web (`public/styles.css`), admin (`public/admin/admin.css`), and iOS (`ios/Optiyou/Views/Components/DesignSystem.swift`) all derive from the tokens defined here. If a value changes here, it changes everywhere.

---

## 1. Positioning

Optiyou is **private-clinic intelligence for everything you eat and apply**. The reference point is not other scanner apps — it is Tesla-grade white elegance crossed with a world-class aesthetic clinic: bright, immaculate, sharp, modern, quietly expensive. Science delivered with grace.

**Audience:** affluent, design-literate clientele who buy the best of everything and expect to *feel* it instantly — the product must signal "you are in very good hands" before a single word is read.

**Brand idea:** *The discerning standard.*

Optiyou doesn't shout health claims. It renders a considered, evidence-graded verdict the way a great clinician would — composed, exact, and entirely about you.

### Personality

| We are | We are never |
|---|---|
| Composed, assured | Loud, alarmist |
| Precise, evidence-led | Vague, hype-driven |
| Warm, attentive | Clinical-cold, robotic |
| Understated luxury | Flashy, gimmicky, "techy" |

---

## 2. Voice

- **Speak like a private consultation, not an ad.** Short declarative sentences. No exclamation marks. No emoji in product or marketing surfaces.
- **Verdicts, not warnings.** "A finer choice exists." rather than "⚠️ BAD PRODUCT!"
- **Second person, singular.** Everything is *for you*, *your standard*, *your profile*.
- **Vocabulary register:** considered, precise, evidence, standard, fit, worthy, refined, verdict. Avoid: hack, boost, super, amazing, gamechanger.

**Tagline:** `Scan smarter. Choose better. Built around you.` remains for app-store contexts.
**Marketing line:** *"The discerning standard for everything you eat and apply."*

---

## 3. Color

The signature theme is **gallery white**: vast white space, near-black ink, warm hairlines, champagne gold details. Emerald is reserved for *verdicts* — it means "good," never "click here." Black is the interactive color (buttons, chips, selected states) — Tesla-sharp against the white field. A **noir** evening theme (deep evergreen-black, glowing emerald, champagne) survives as the website's dark mode and as permanent dark moments (the invitation panel, the scanner camera).

### Core palette — gallery white (default)

| Token | Hex | Usage |
|---|---|---|
| `bg` | `#FCFCFA` | Page/app background. Gallery white, faintly warm. |
| `card` | `#FFFFFF` | Raised surfaces — pure white with hairline + soft floating shadow. |
| `ink` / `primary` | `#101413` | Primary text AND interactive accent: buttons, selected chips, links. |
| `muted` | `#6F746E` | Secondary text, captions. |
| `line` | `#E7E4DA` | Hairline rules, borders. Warm, never gray. |
| `evergreen` | `#1E5743` / `#2F7D5F` | Verdict green only — scores, checkmarks, confidence. Not an interaction color. |
| `gold` | `#A88A4F` | Champagne — eyebrows, numerals, decorative accents. Text-weight uses only. |
| `gold-soft` | `#CDBC8B` | Decorative gold on dark grounds (scanner frame, invitation panel). |
| `terracotta` | `#B0563F` | Poor/critical — composed, never alarm-red. |
| `slate` | `#51707F` | Informational. |

### Noir theme (website dark mode + permanent dark moments)

`bg #0A1410 · ink #F1EEE3 · emerald #43B287 · gold #CDBC8B · primary = ivory`

**Rules**
- Black (ink) owns interaction; emerald owns meaning. Never use green for a button just to feel "healthy."
- Gold is an accent, never a surface — if gold occupies more than ~5% of a view, it's too much.
- Sharp geometry: 0-radius buttons/chips on web; ≤10pt card radii in the app. Crisp hairlines everywhere.
- One black CTA per view. Everything else is quiet.

---

## 4. Typography

**Display — Cormorant Garamond** (Google Fonts). Weights 500–600, tight leading (0.95–1.05), used for headlines, large numerals, and the wordmark. Italic for editorial emphasis.

**Text & UI — Jost** (Google Fonts). Weights 300–600. Body copy, labels, buttons, navigation. Geometric, calm, spa-like.

**Labels/eyebrows:** Jost 500, uppercase, `letter-spacing: 0.22em`, 11–13px, usually `gold` or `muted`.

**iOS:** New York (system serif, `.fontDesign(.serif)`) for display and numerals; SF Pro for body/UI. Do not embed web fonts in the app — the native serif keeps it premium and accessible.

**Wordmark:** `OPTIYOU` set in Cormorant Garamond 500, uppercase, `letter-spacing: 0.3em`. No icon-font lockups.

---

## 5. The Mark

An **O-and-orbit seal**: a thin ivory circle (the *O*, the product) crossed by a champagne ellipse orbit (the analysis, around *you*), on a deep evergreen field. Files: `public/favicon.svg` (canonical). Render small as the app icon/favicon; render large as a watermark seal at low opacity.

---

## 6. Form language

- **Radii:** Buttons and chips are sharp (2px) — fashion-house, not bubble. Cards 16–20px. iOS cards 18pt continuous.
- **Hairlines everywhere:** 1px `line` rules to structure sections; `gold-soft` rules for emphasis.
- **Numbered sections** use oversized Cormorant numerals (`01 / 02 / 03`) in gold.
- **Shadows:** barely-there and warm (`rgba(22,29,24,0.07)`), large blur, never harsh.
- **Spacing:** generous. Section padding ≥ 96px desktop / 64px mobile. Whitespace is the luxury.
- **Buttons:** uppercase Jost 500, `letter-spacing: 0.14em`, 50–54px tall. Primary = evergreen fill; secondary = 1px ink outline on transparent.
- **Motion:** slow and subtle — 300–500ms ease-out fades and small translates. Nothing bounces.

---

## 7. Per-surface notes

- **Marketing site:** cinematic single-page experience in **gallery white** by default, noir as the dark-mode toggle. Black 0-radius CTAs, white hairline cards, gold details, the vitality orb on white, and a permanently-black invitation panel for the Tesla contrast moment. Motion language: GSAP scroll reveals, particle field, 3D tilt cards, magnetic CTAs — all slow, eased, 60fps, disabled under `prefers-reduced-motion`. Engine: `public/app.js`.
- **iOS app:** gallery white, locked to light appearance (`.preferredColorScheme(.light)`). White hairline cards (10pt, soft floating shadow), gradient score dials with serif numerals (New York), serif screen/nav titles, black interactive tint and black selection chips, champagne dashed viewfinder over the dark camera, translucent white bars. Never a carrot anywhere (that's Yuka) — History uses `clock.arrow.circlepath`. Tokens/components: `ios/Optiyou/Views/Components/DesignSystem.swift`; bar appearances: `ios/Optiyou/OptiyouApp.swift`.
- **Admin portal:** same tokens, denser layout; luxury is lower priority than legibility but tokens stay consistent.

---

*Created 2026-06-09. Direction: "premiere spa / aesthetic clinic — incredibly rich, elegant, polished, high-class."*
