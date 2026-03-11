# Design System — Centralized Visual Intelligence

**EVERY employee MUST read this skill before creating ANY document, PDF, HTML, spreadsheet, presentation, or visual output.** This is the org-wide standard. Format-specific skills (create-pdf, create-docx, create-pptx, etc.) handle tooling. This skill handles THINKING.

---

## Part 1: Design Philosophy

### The Problem You're Solving

You are NOT filling in a template. You are creating a professional artifact that someone will judge on first impression. Every document communicates two things: the content AND the competence of whoever made it. Tacky output = tacky organization.

### Core Principles

**1. Purpose-First Layout**
Before writing a single line of code, ask: "What KIND of document is this?" A CV is not a report. An invoice is not a letter. A dashboard is not a memo. Each has different visual hierarchies, reading patterns, and expectations. Choose the layout archetype FIRST (see Part 4), then adapt.

**2. Visual Hierarchy Is Everything**
The reader's eye must flow naturally. This means:
- ONE dominant element per page (title, hero stat, key visual)
- Clear size contrast: titles should be at LEAST 2x body text size
- Color used sparingly for emphasis, not decoration
- Whitespace is a design element — it's not "empty," it's breathing room

**3. Restraint Over Decoration**
Professional design is about what you REMOVE, not what you add:
- Maximum 2 fonts per document (one for headings, one for body)
- Maximum 3 colors (primary, secondary, accent) plus neutrals
- No gradients unless specifically requested
- No drop shadows on text
- No rounded corners mixed with sharp corners — pick one system
- No decorative borders — use whitespace to separate sections

**4. Consistency Is Non-Negotiable**
- Same spacing between ALL equivalent sections (don't eyeball it)
- Same font size for ALL body text across the entire document
- Same color for ALL headings of the same level
- Same alignment system throughout (don't mix centered and left-aligned headers)
- Same margin on all sides unless there's a deliberate sidebar

**5. Craftsmanship Mindset**
The output must look like someone spent HOURS on it:
- No orphaned lines (single line of a paragraph at top/bottom of a page)
- No awkward page breaks mid-section
- No overlapping text (test with long strings!)
- No cramped tables — give cells generous padding
- Proper em dashes (—), curly quotes, and typographic details
- All dates formatted consistently
- All numbers aligned properly in tables

---

## Part 2: Document Context — Internal vs External

Before choosing a theme, determine the AUDIENCE. This is mandatory.

### Internal Documents
Documents seen only by the user or the team. These should be clean and professional but can be more utilitarian.
- **Examples:** status reports, health checks, weekly digests, data summaries, internal memos
- **Approach:** Use `Minimal` or `Charcoal` theme. Prioritize clarity over polish. Tables and data density are fine.
- **Tone:** Direct, information-dense, efficient

### External Documents
Documents that leave the organization — sent to clients, employers, partners, or published publicly.
- **Examples:** CVs, pitch decks, proposals, client reports, portfolio pieces, presentations for meetings
- **Approach:** Use any theme that fits the domain. Maximum polish. Every pixel matters.
- **Tone:** Polished, confident, designed

### How to Decide
If the user says "create a report" without specifying audience:
- If it's a scheduled task output → Internal
- If it mentions a person/company/client → External
- If it's about system status → Internal
- If it could go on a resume or in a meeting → External
- When genuinely unsure → Default to External (better to over-polish than under-polish)

---

## Part 3: Theme System

Every document gets a theme. **Do NOT ask the user to pick a theme.** Auto-select using the table in "Theme Auto-Selection" below. A theme defines colors, fonts, and personality.

### The 10 Themes

#### 1. Executive
```
primary:     1B2A4A  (deep navy)
secondary:   2E5090  (steel blue)
accent:      C8A97E  (warm gold)
bg_light:    F8F6F3  (warm gray)
bg_alt:      EEF1F5  (cool mist)
text_body:   2D3436  (near-black)
text_muted:  6B7B8D  (medium gray)
border:      D5DAE0  (light gray)
header_font: Georgia
body_font:   Calibri
```

#### 2. Tech Modern
```
primary:     0A1628  (midnight)
secondary:   1E88E5  (electric blue)
accent:      00E5A0  (neon mint)
bg_light:    F5F7FA  (ghost white)
bg_alt:      E8ECF1  (pale blue-gray)
text_body:   1A1A2E  (dark indigo)
text_muted:  6C7A89  (slate)
border:      D0D7DE  (silver)
header_font: Calibri
body_font:   Calibri Light
```

#### 3. Creative
```
primary:     2D1B69  (deep violet)
secondary:   E74C7A  (rose pink)
accent:      F2994A  (warm orange)
bg_light:    FAFAFA  (off-white)
bg_alt:      F3EDF7  (lavender mist)
text_body:   333333  (dark gray)
text_muted:  888888  (medium gray)
border:      E0D6EB  (light purple)
header_font: Trebuchet MS
body_font:   Calibri
```

#### 4. Nature
```
primary:     2C5F2D  (forest green)
secondary:   97BC62  (moss green)
accent:      D4A844  (honey gold)
bg_light:    F7F5F0  (natural cream)
bg_alt:      EDF3E8  (pale green)
text_body:   2C3E2D  (dark green-gray)
text_muted:  6B7D6B  (sage)
border:      D4DED0  (moss gray)
header_font: Cambria
body_font:   Calibri
```

#### 5. Warm Professional
```
primary:     B85042  (terracotta)
secondary:   8B5E34  (warm bronze)
accent:      A7BEAE  (sage green)
bg_light:    FBF8F5  (warm white)
bg_alt:      F2ECE4  (light tan)
text_body:   3B2F2F  (dark brown)
text_muted:  8B7B6B  (taupe)
border:      D9CEBC  (sand)
header_font: Georgia
body_font:   Garamond
```

#### 6. Minimal
```
primary:     111111  (near black)
secondary:   444444  (dark gray)
accent:      0066CC  (clean blue)
bg_light:    FFFFFF  (pure white)
bg_alt:      F5F5F5  (off-white)
text_body:   222222  (very dark gray)
text_muted:  999999  (light gray)
border:      E0E0E0  (pale gray)
header_font: Calibri
body_font:   Calibri Light
```

#### 7. Teal Trust
```
primary:     065A82  (deep teal)
secondary:   1C7293  (ocean blue)
accent:      02C39A  (seafoam mint)
bg_light:    F0F7F9  (ice mist)
bg_alt:      E3EFF3  (pale teal)
text_body:   1A2F38  (dark slate)
text_muted:  5A7A84  (storm gray)
border:      C8DDE3  (frost)
header_font: Georgia
body_font:   Calibri
```

#### 8. Berry & Cream
```
primary:     6D2E46  (berry)
secondary:   A26769  (dusty rose)
accent:      ECE2D0  (warm cream)
bg_light:    FDF9F6  (blush white)
bg_alt:      F5EDED  (rose mist)
text_body:   3D2B2B  (dark maroon)
text_muted:  8B6F6F  (muted rose)
border:      E0D2D2  (pink sand)
header_font: Palatino
body_font:   Garamond
```

#### 9. Charcoal
```
primary:     36454F  (charcoal)
secondary:   546E7A  (blue-gray)
accent:      FF6F61  (living coral)
bg_light:    FAFAFA  (off-white)
bg_alt:      ECEFF1  (light gray)
text_body:   263238  (dark charcoal)
text_muted:  78909C  (steel)
border:      CFD8DC  (silver)
header_font: Arial Black
body_font:   Arial
```

#### 10. Cherry Bold
```
primary:     990011  (cherry red)
secondary:   CC1A33  (bright red)
accent:      2F3C7E  (contrast navy)
bg_light:    FCF6F5  (off-white)
bg_alt:      F8EDED  (rose white)
text_body:   1A1A1A  (near black)
text_muted:  6B6B6B  (medium gray)
border:      E8D8D8  (pink gray)
header_font: Georgia
body_font:   Calibri
```

### Theme Auto-Selection (MANDATORY)

**Do NOT ask the user which theme to use.** Match automatically:

| Topic / Context | Theme | Why |
|----------------|-------|-----|
| CV, resume, job application | **Teal Trust** or **Executive** | Professional but not corporate-generic |
| Technical architecture, engineering, DevOps | **Tech Modern** | Signals technical competence |
| Business report, corporate memo | **Executive** | Traditional authority |
| Pitch deck, startup, marketing | **Creative** or **Cherry Bold** | Energy and boldness |
| Financial report, consulting, advisory | **Warm Professional** | Trust and warmth |
| Health, education, sustainability, wellness | **Nature** | Calm authority |
| Data dashboard, analytics, metrics | **Charcoal** or **Minimal** | Data is the hero, not chrome |
| Brand, design, portfolio, creative brief | **Creative** or **Berry & Cream** | Visual personality |
| Internal status report, system health | **Minimal** or **Charcoal** | Clean and utilitarian |
| Roadmap, strategy, planning | **Teal Trust** or **Executive** | Forward-looking confidence |
| Client proposal, external deliverable | **Executive** or **Warm Professional** | Trust and competence |
| Personal / lifestyle / real estate | **Warm Professional** | Approachable warmth |

**If two themes are listed**, pick the one that feels more specific to the content. If the user has used a theme before in the same session, maintain consistency.

**Override rule:** If the user explicitly requests a color scheme or theme, always honor that.

---

## Part 4: Document Archetypes

Before creating ANY document, identify which archetype applies. Each archetype has a fundamentally different layout structure.

### Resume / CV
```
Structure:
- Name: LARGE (28-32pt), left-aligned or centered
- Title/tagline: medium (14-16pt), lighter color, positioned BELOW name with clear spacing
- Contact info: small (9-10pt), single line or row, secondary color
- Section headers: bold, accent-colored, with subtle line separator
- Content: two-column OR full-width depending on density
- Skills: tag-style or compact grid, NOT long bullet lists
- Page count: ideally 1-2 pages, NO half-empty pages

CRITICAL CV RULES:
- Name and title must NEVER overlap (add spaceBefore/spaceAfter)
- If page 2 is less than 40% filled, reformat to fit on 1 page
- Use consistent date alignment (right-aligned)
- Company/role is a visual pair: company bold, role italic (or vice versa)
```

### Business Report / Memo
```
Structure:
- Cover page: title + date + author + optional summary
- Headers: clear hierarchy (H1 >> H2 >> H3 in size/weight)
- Body: full-width, 1.15-1.3x line spacing
- Tables/charts: centered with captions
- Footer: page numbers
- Spacing: generous between sections (24-36pt)
```

### Invoice / Financial Document
```
Structure:
- Company header: logo placeholder + company info (top-left)
- Invoice details: invoice #, date, due date (top-right)
- Bill-to section: clearly boxed or separated
- Line items: table with strong header, right-aligned numbers
- Totals: right-aligned, subtotal → tax → TOTAL (largest, bold)
- Footer: payment terms, bank details
```

### Dashboard / Data Summary
```
Structure:
- KPI cards at top: 3-4 large numbers with labels
- Charts: full-width or 2-column grid
- Tables: compact, filterable feel
- Minimal chrome — data is the hero
```

### Letter / Correspondence
```
Structure:
- Sender info: top-right or letterhead
- Date
- Recipient address
- Salutation
- Body: single column, normal paragraphs
- Sign-off + signature
```

### Presentation
```
Structure:
- Title slide: dark background, high impact, minimal text
- Content slides: 1 idea per slide, max 5 bullets, EVERY slide has a visual element
- Data slides: chart/table is hero, title as context only
- Section dividers: full-color background, marks transitions
- Summary slide: key takeaways, call to action
- Must use at least 3 different layout types across the deck
```

---

## Part 5: Typography Rules

### Font Pairing
Each theme specifies a `header_font` and `body_font`. Use them. Do NOT default to Arial for everything.

### Size Hierarchy
| Element | Size | Weight |
|---------|------|--------|
| Document title | 28-44pt | Bold |
| Section header (H1) | 20-24pt | Bold |
| Sub-header (H2) | 16-18pt | Bold |
| Body text | 11-14pt | Regular |
| Captions / footnotes | 8-10pt | Regular, muted color |

### Spacing
- 0.5" minimum margins on all sides
- 0.3-0.5" between content blocks
- 1.15-1.35x line height for body text
- Leave breathing room — don't fill every inch

---

## Part 6: Quality Gate

**BEFORE sending ANY document, run this mental checklist:**

1. **Theme test:** Did you auto-select a theme based on the topic? Is it NOT generic blue?
2. **Audience test:** Is this internal or external? Does the polish level match?
3. **Layout test:** Does the document look professional at first glance? (Squint test — blur your vision and check if the layout has clear structure)
4. **Overlap test:** Does ANY text overlap with other text or run off the page? (This is the #1 amateur mistake)
5. **Whitespace test:** Is there awkward empty space on any page? (If yes, redistribute content or reduce page count)
6. **Consistency test:** Are all same-level headings the same size/color/font? All body text identical? All spacing uniform?
7. **Color test:** Are you using more than 3 colors (excluding neutrals)? If yes, simplify.
8. **Typography test:** Are you using the theme's specified fonts? Are sizes clearly hierarchical?
9. **Content test:** For the document type, does the layout match the archetype? (A CV should look like a CV, not a report)
10. **Edge case test:** What happens with long names, long titles, many bullet points? Test the extremes.

**If ANY check fails, fix it before delivering.** The quality gate is non-negotiable.

---

## Part 7: Visual QA (Presentations & Complex Documents)

For presentations and visually complex documents, **you MUST visually verify your output** before delivering:

```bash
# Convert PPTX to images for visual inspection
libreoffice --headless --convert-to pdf output.pptx
pdftoppm -jpeg -r 150 output.pdf slide
ls -1 slide-*.jpg
```

Then READ each slide image and check for:
- Overlapping elements (text through shapes, lines through words)
- Text overflow or cut off at edges
- Broken icons (? boxes instead of real icons)
- Elements too close (< 0.3" gaps) or touching
- Dead space > 30% on any slide
- Low-contrast text or icons
- Layout monotony (same layout repeated on consecutive slides)

**If you find issues, fix and re-verify. Your first render is almost never correct.**

---

## Part 8: Cross-Format Consistency

All format-specific skills (create-pdf, create-docx, create-pptx, create-xlsx, create-html) reference this design system. When creating a document:

1. Read THIS skill first (design-system)
2. Determine the audience — internal or external (Part 2)
3. Identify the document archetype (Part 4)
4. Theme is auto-selected based on topic (Part 3) — do NOT ask the user
5. Read the format-specific skill for implementation details
6. Apply the quality gate (Part 6) before delivering
7. For presentations: run visual QA (Part 7) before delivering

This ensures every output from every employee, regardless of format, reflects the same level of visual intelligence and professional craftsmanship.
