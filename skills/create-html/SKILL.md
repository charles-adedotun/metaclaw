# Create HTML Documents & Pages

**PREREQUISITE:** Read `/home/node/.claude/skills/design-system/SKILL.md` FIRST. It defines the design philosophy, theme system, and document archetypes you MUST follow. This skill handles implementation.

You have Node.js 22 and Python 3 available. Write HTML files directly — no build tools needed.

---

## Step 1: Design Before Code

Before writing ANY HTML:
1. Identify what you're creating (report? dashboard? landing page? email template? portfolio?)
2. Select theme from design system
3. Plan the layout: sections, visual hierarchy, responsive needs
4. THEN start coding

---

## Step 2: Theme Integration

Map design-system themes to CSS custom properties:

```css
:root {
  /* Executive theme (default) */
  --primary:    #1B2A4A;
  --secondary:  #2E5090;
  --accent:     #C8A97E;
  --bg-light:   #F8F6F3;
  --bg-alt:     #EEF1F5;
  --text-body:  #2D3436;
  --text-muted: #6B7B8D;
  --border:     #D5DAE0;
}
```

---

## Step 3: Base HTML Structure

Every HTML document should follow this skeleton:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document Title</title>
  <style>
    /* ===== RESET & BASE ===== */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --primary:    #1B2A4A;
      --secondary:  #2E5090;
      --accent:     #C8A97E;
      --bg-light:   #F8F6F3;
      --bg-alt:     #EEF1F5;
      --text-body:  #2D3436;
      --text-muted: #6B7B8D;
      --border:     #D5DAE0;
      --white:      #FFFFFF;
      --radius:     6px;
      --shadow-sm:  0 1px 3px rgba(0,0,0,0.08);
      --shadow-md:  0 4px 12px rgba(0,0,0,0.1);
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: var(--text-body);
      background: var(--white);
      -webkit-font-smoothing: antialiased;
    }

    /* ===== TYPOGRAPHY ===== */
    h1 {
      font-size: 2.25rem;
      font-weight: 700;
      color: var(--primary);
      line-height: 1.2;
      margin-bottom: 0.5rem;
    }
    h2 {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--primary);
      line-height: 1.3;
      margin-top: 2.5rem;
      margin-bottom: 0.75rem;
    }
    h3 {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--secondary);
      margin-top: 1.5rem;
      margin-bottom: 0.5rem;
    }
    p {
      margin-bottom: 1rem;
      max-width: 65ch; /* optimal reading width */
    }
    a { color: var(--secondary); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* ===== LAYOUT ===== */
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }
    .container-wide {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }

    /* ===== HEADER ===== */
    .doc-header {
      border-bottom: 2px solid var(--secondary);
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }
    .doc-header .subtitle {
      font-size: 0.9rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    /* ===== CARDS ===== */
    .card {
      background: var(--white);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem;
      margin-bottom: 1rem;
      box-shadow: var(--shadow-sm);
    }
    .card-accent {
      border-left: 4px solid var(--accent);
    }

    /* ===== KPI ROW ===== */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin: 1.5rem 0;
    }
    .kpi-card {
      background: var(--bg-alt);
      border-radius: var(--radius);
      padding: 1.25rem;
      text-align: center;
      border: 1px solid var(--border);
    }
    .kpi-value {
      font-size: 2rem;
      font-weight: 700;
      color: var(--primary);
      line-height: 1.2;
    }
    .kpi-label {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    /* ===== TABLES ===== */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
      font-size: 0.9rem;
    }
    thead th {
      background: var(--secondary);
      color: var(--white);
      font-weight: 600;
      padding: 0.75rem 1rem;
      text-align: left;
    }
    tbody td {
      padding: 0.65rem 1rem;
      border-bottom: 1px solid var(--border);
    }
    tbody tr:nth-child(even) {
      background: var(--bg-alt);
    }
    tbody tr:hover {
      background: #E8ECF1;
    }

    /* ===== TAGS / BADGES ===== */
    .tag {
      display: inline-block;
      padding: 0.2rem 0.6rem;
      font-size: 0.75rem;
      font-weight: 500;
      border-radius: 999px;
      background: var(--bg-alt);
      color: var(--secondary);
      border: 1px solid var(--border);
    }
    .tag-success { background: #E8F5E9; color: #2E7D32; border-color: #C8E6C9; }
    .tag-warning { background: #FFF3E0; color: #E65100; border-color: #FFE0B2; }
    .tag-danger  { background: #FFEBEE; color: #C62828; border-color: #FFCDD2; }

    /* ===== SECTION DIVIDER ===== */
    .divider {
      height: 1px;
      background: var(--border);
      margin: 2rem 0;
    }

    /* ===== FOOTER ===== */
    .doc-footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      font-size: 0.8rem;
      color: var(--text-muted);
      text-align: center;
    }

    /* ===== RESPONSIVE ===== */
    @media (max-width: 768px) {
      h1 { font-size: 1.75rem; }
      h2 { font-size: 1.25rem; }
      .kpi-row { grid-template-columns: repeat(2, 1fr); }
      table { font-size: 0.8rem; }
      thead th, tbody td { padding: 0.5rem; }
    }

    /* ===== PRINT ===== */
    @media print {
      body { font-size: 11pt; }
      .container { max-width: 100%; padding: 0; }
      .card { box-shadow: none; border: 1px solid #ccc; }
      a { color: var(--text-body); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="doc-header">
      <h1>Document Title</h1>
      <p class="subtitle">Prepared by ${process.env.ASSISTANT_NAME || "Assistant"}  •  March 10, 2026</p>
    </div>

    <!-- KPI Section -->
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-value">99.9%</div>
        <div class="kpi-label">Uptime</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">45ms</div>
        <div class="kpi-label">Avg Response</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">2.4M</div>
        <div class="kpi-label">Daily Requests</div>
      </div>
    </div>

    <!-- Content Section -->
    <h2>Section Heading</h2>
    <p>Body text with optimal reading width. Professional documents respect the reader's eye — lines longer than 65 characters become hard to track.</p>

    <!-- Table -->
    <table>
      <thead>
        <tr>
          <th>Metric</th>
          <th>Value</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Uptime</td>
          <td>99.9%</td>
          <td><span class="tag tag-success">Healthy</span></td>
        </tr>
        <tr>
          <td>Response Time</td>
          <td>45ms</td>
          <td><span class="tag tag-success">Good</span></td>
        </tr>
      </tbody>
    </table>

    <!-- Card -->
    <div class="card card-accent">
      <h3>Key Insight</h3>
      <p>Cards with accent borders draw attention to important callouts.</p>
    </div>

    <div class="doc-footer">
      Generated by ${process.env.ASSISTANT_NAME || "Assistant"}  •  March 2026
    </div>
  </div>
</body>
</html>
```

---

## Step 4: Archetype Patterns

### Report / Document
- Use `.container` (900px) for text-heavy content
- Header with title + subtitle + divider
- Sections with `h2` headings
- Tables and cards for data
- Print-friendly

### Dashboard
- Use `.container-wide` (1200px)
- KPI row at top
- Grid layout for charts/tables (use CSS Grid)
- Minimal chrome — data is hero

### Landing Page
- Full-width hero section with primary background
- Feature grid (3 columns)
- Testimonial cards
- CTA buttons with accent color

### Email-style Report
- Max-width 600px, centered
- Inline styles for email compatibility
- Simple layout: header, content blocks, footer

---

## Step 5: Implementation Rules

1. **All CSS is inline in `<style>` tag** — single file, no external dependencies
2. **CSS custom properties for theming** — easy to swap themes
3. **Responsive by default** — use `max-width`, `grid`, `auto-fit`
4. **Print stylesheet** — always include `@media print` rules
5. **No JavaScript unless interactive** — static documents don't need JS
6. **Semantic HTML** — use `<article>`, `<section>`, `<header>`, `<footer>`, `<table>`
7. **System fonts** — use the system font stack, no external font loading
8. **File output** — save to `/workspace/group/output.html`

---

## Quality Checklist (from Design System)
Before calling `send_file`:
- [ ] Read design-system SKILL.md and identified archetype + theme
- [ ] CSS custom properties match selected theme
- [ ] Clear visual hierarchy (h1 >> h2 >> h3 >> body)
- [ ] Max-width container prevents overly wide text
- [ ] Tables have themed header, alternating rows, hover states
- [ ] Responsive at 768px breakpoint
- [ ] Print styles included
- [ ] NO inline styles on individual elements (use classes)
- [ ] Consistent spacing throughout
- [ ] File saved to `/workspace/group/`
