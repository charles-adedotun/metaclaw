# Create PowerPoint Presentations (.pptx)

**PREREQUISITES (read in order):**
1. `/home/node/.claude/skills/design-system/SKILL.md` — design philosophy, theme auto-selection, archetypes
2. `/home/node/.claude/skills/create-pptx/pptxgenjs.md` — full pptxgenjs API reference (shapes, charts, images, tables, pitfalls)

This skill handles presentation-specific design decisions and code patterns.

You have `pptxgenjs`, `react-icons`, `react`, `react-dom`, and `sharp` globally installed. `NODE_PATH=/usr/local/lib/node_modules`.

You have `libreoffice` and `pdftoppm` for visual QA.

---

## Step 1: Design Before Code

**Don't write code yet.** Plan the entire presentation first:

1. **Auto-select theme** from the design-system's theme table based on the topic. Do NOT ask the user.
2. **Determine audience** — internal or external? (Design system Part 2)
3. **Plan every slide** — write a 1-line description of each slide's purpose and layout type
4. **Ensure layout variety** — no two consecutive slides should use the same layout pattern
5. **Decide on visual motif** — pick ONE distinctive element and carry it across every slide (e.g., icons in colored circles, left-accent bars, card shadows)
6. THEN start coding

---

## Step 2: Theme Setup

Get the theme from the design-system. Build a theme object in code:

```javascript
const pptxgen = require('pptxgenjs');
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33" x 7.5"
pres.author = (process.env.ASSISTANT_NAME || "Assistant") + " — Chief of Staff";

// Theme from design-system auto-selection
// Example: Teal Trust (for CV topic)
const T = {
  primary:   "065A82",
  secondary: "1C7293",
  accent:    "02C39A",
  bgLight:   "F0F7F9",
  bgAlt:     "E3EFF3",
  textBody:  "1A2F38",
  textMuted: "5A7A84",
  border:    "C8DDE3",
  white:     "FFFFFF",
};
const FONT = { header: "Georgia", body: "Calibri" };
```

**IMPORTANT:** Strip `#` from hex colors. pptxgenjs uses bare hex strings.

---

## Step 3: Icons

Use `react-icons` to render real SVG icons as PNG. **NEVER use emoji or unicode as icons** — they render as "?" boxes.

```javascript
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const { FaServer, FaShieldAlt, FaRocket, FaUsers } = require("react-icons/fa");

function renderIconSvg(IconComponent, color = "#000000", size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}

async function iconToBase64Png(IconComponent, color, size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}
```

**Icon libraries available:**
- `react-icons/fa` — Font Awesome (most complete)
- `react-icons/md` — Material Design
- `react-icons/hi` — Heroicons
- `react-icons/bi` — Bootstrap Icons

**CRITICAL: Icon circles MUST use ONE consistent color from the theme — either `T.primary` or `T.secondary`. NEVER use random/different colors per icon.** The icon itself is always white (`#FFFFFF`) inside the circle.

```javascript
const iconData = await iconToBase64Png(FaServer, "#FFFFFF", 256);
slide.addShape(pres.shapes.OVAL, {
  x: 1.5, y: 2.0, w: 0.7, h: 0.7,
  fill: { color: T.secondary }  // ALWAYS use ONE theme color for ALL icon circles
});
slide.addImage({ data: iconData, x: 1.6, y: 2.1, w: 0.5, h: 0.5 });
```

---

## Step 4: Layout Patterns

You MUST use at least 3 different layout types in any deck with 5+ slides. **Every slide needs a visual element** — no text-only slides.

### Layout A: Title Slide (Dark, Bold, Minimal)
```javascript
let slide = pres.addSlide();
slide.background = { color: T.primary };

slide.addText("Presentation Title", {
  x: 0.8, y: 2.0, w: 11.7, h: 1.5,
  fontSize: 44, fontFace: FONT.header, color: T.white, bold: true,
  align: "left", margin: 0
});
slide.addText("Subtitle or context  •  March 2026", {
  x: 0.8, y: 3.8, w: 11.7, h: 0.6,
  fontSize: 16, fontFace: FONT.body, color: T.textMuted, italic: true
});
addSlideNumber(slide, 1); // helper defined below
```

### Layout B: Two-Column (Dark Panel Left, Content Right)
```javascript
slide = pres.addSlide();
slide.background = { color: T.white };

// Left panel — dark
slide.addShape(pres.shapes.RECTANGLE, {
  x: 0, y: 0, w: 3.8, h: 7.5,
  fill: { color: T.primary }
});
slide.addText("Section\nTitle", {
  x: 0.5, y: 2.0, w: 2.8, h: 2.0,
  fontSize: 32, fontFace: FONT.header, color: T.white, bold: true,
  lineSpacingMultiple: 1.2, margin: 0
});

// Right content
slide.addText([
  { text: "Key point one with explanation", options: { bullet: true, breakLine: true, fontSize: 16 } },
  { text: "Key point two with context", options: { bullet: true, breakLine: true, fontSize: 16 } },
  { text: "Key point three — concise", options: { bullet: true, fontSize: 16 } },
], {
  x: 4.3, y: 1.5, w: 8.5, h: 5.0,
  fontFace: FONT.body, color: T.textBody, paraSpaceAfter: 12
});
```

### Layout C: Icon + Text Rows (Feature/Capability Slide)
Use `T.bgLight` or `T.bgAlt` background — NOT plain white. Plain white icon rows look flat and forgettable.
```javascript
slide = pres.addSlide();
slide.background = { color: T.bgLight }; // NOT T.white — avoid flat, boring slides

slide.addText("Slide Title", {
  x: 0.8, y: 0.5, w: 12, h: 0.8,
  fontSize: 28, fontFace: FONT.header, color: T.primary, bold: true, margin: 0
});

const features = [
  { icon: FaServer, title: "Feature One", desc: "Short description of this feature" },
  { icon: FaShieldAlt, title: "Feature Two", desc: "Short description of this feature" },
  { icon: FaRocket, title: "Feature Three", desc: "Short description of this feature" },
];

for (let i = 0; i < features.length; i++) {
  const y = 1.8 + (i * 1.8);
  slide.addShape(pres.shapes.OVAL, {
    x: 1.0, y, w: 0.65, h: 0.65,
    fill: { color: T.secondary }
  });
  const iconData = await iconToBase64Png(features[i].icon, "#FFFFFF", 256);
  slide.addImage({ data: iconData, x: 1.08, y: y + 0.08, w: 0.5, h: 0.5 });
  slide.addText(features[i].title, {
    x: 2.0, y, w: 10, h: 0.35,
    fontSize: 18, fontFace: FONT.body, color: T.primary, bold: true, margin: 0
  });
  slide.addText(features[i].desc, {
    x: 2.0, y: y + 0.35, w: 10, h: 0.3,
    fontSize: 14, fontFace: FONT.body, color: T.textMuted, margin: 0
  });
}
```

### Layout D: KPI Cards (Big Numbers as Hero)
```javascript
slide = pres.addSlide();
slide.background = { color: T.bgLight };

slide.addText("Key Metrics", {
  x: 0.8, y: 0.5, w: 12, h: 0.8,
  fontSize: 28, fontFace: FONT.header, color: T.primary, bold: true, margin: 0
});

const makeShadow = () => ({ type: "outer", blur: 6, offset: 2, angle: 135, color: "000000", opacity: 0.1 });

const kpis = [
  { value: "6", label: "Active Staff" },
  { value: "24/7", label: "Uptime" },
  { value: "7+", label: "Scheduled Tasks" },
];

kpis.forEach((kpi, i) => {
  const x = 0.8 + (i * 4.1);
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y: 2.0, w: 3.6, h: 3.0,
    fill: { color: T.white }, shadow: makeShadow(),
    line: { color: T.border, width: 0.5 }
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y: 2.0, w: 3.6, h: 0.06,
    fill: { color: T.secondary }
  });
  slide.addText(kpi.value, {
    x, y: 2.4, w: 3.6, h: 1.4,
    fontSize: 52, fontFace: FONT.header, color: T.primary, bold: true,
    align: "center", valign: "middle"
  });
  slide.addText(kpi.label, {
    x, y: 3.8, w: 3.6, h: 0.5,
    fontSize: 13, fontFace: FONT.body, color: T.textMuted,
    align: "center"
  });
});
```

### Layout E: Table as Hero (Data Slide)
```javascript
slide = pres.addSlide();
slide.background = { color: T.white };

slide.addText("Data Overview", {
  x: 0.8, y: 0.5, w: 12, h: 0.8,
  fontSize: 28, fontFace: FONT.header, color: T.primary, bold: true, margin: 0
});

const rows = [
  [
    { text: "Task", options: { bold: true, color: "FFFFFF", fill: { color: T.secondary } } },
    { text: "Schedule", options: { bold: true, color: "FFFFFF", fill: { color: T.secondary } } },
    { text: "Owner", options: { bold: true, color: "FFFFFF", fill: { color: T.secondary } } },
  ],
  // Alternate white / bgAlt for rows
  [
    { text: "Morning briefing", options: { fill: { color: T.white } } },
    { text: "6:00 AM daily", options: { fill: { color: T.white } } },
    { text: process.env.ASSISTANT_NAME || "Assistant", options: { fill: { color: T.white } } },
  ],
  [
    { text: "Infra health", options: { fill: { color: T.bgAlt } } },
    { text: "Every 6 hours", options: { fill: { color: T.bgAlt } } },
    { text: "SysAdmin", options: { fill: { color: T.bgAlt } } },
  ],
];

slide.addTable(rows, {
  x: 0.8, y: 1.6, w: 11.5,
  fontSize: 14, fontFace: FONT.body, color: T.textBody,
  border: { type: "solid", pt: 0.5, color: T.border },
  colW: [4, 4, 3.5], rowH: [0.5, 0.45, 0.45],
  margin: [8, 12, 8, 12],
});
```

### Layout F: Two-Column Comparison (Can/Cannot, Pros/Cons)
```javascript
slide = pres.addSlide();
slide.background = { color: T.white };

slide.addText("Comparison Title", {
  x: 0.8, y: 0.5, w: 12, h: 0.8,
  fontSize: 28, fontFace: FONT.header, color: T.primary, bold: true, margin: 0
});

// Left card (green-tinted)
slide.addShape(pres.shapes.RECTANGLE, {
  x: 0.6, y: 1.6, w: 5.9, h: 5.2,
  fill: { color: "F0FFF4" }, line: { color: "C6F6D5", width: 1 }
});
slide.addText("CAN ACCESS", {
  x: 0.8, y: 1.8, w: 5.5, h: 0.5,
  fontSize: 16, fontFace: FONT.body, color: "2F855A", bold: true
});
// Add bullet items...

// Right card (red-tinted)
slide.addShape(pres.shapes.RECTANGLE, {
  x: 6.8, y: 1.6, w: 5.9, h: 5.2,
  fill: { color: "FFF5F5" }, line: { color: "FED7D7", width: 1 }
});
slide.addText("CANNOT ACCESS", {
  x: 7.0, y: 1.8, w: 5.5, h: 0.5,
  fontSize: 16, fontFace: FONT.body, color: "C53030", bold: true
});
```

### Layout G: Roadmap / Phase Columns
```javascript
slide = pres.addSlide();
slide.background = { color: T.white };

slide.addText("Roadmap", {
  x: 0.8, y: 0.5, w: 12, h: 0.8,
  fontSize: 28, fontFace: FONT.header, color: T.primary, bold: true, margin: 0
});

const phases = [
  { title: "Phase 1 • Now", color: T.secondary, items: ["Item A", "Item B", "Item C"] },
  { title: "Phase 2 • Next", color: T.accent, items: ["Item D", "Item E"] },
  { title: "Phase 3 • Future", color: T.primary, items: ["Item F", "Item G"] },
];

phases.forEach((phase, i) => {
  const x = 0.6 + (i * 4.2);
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y: 1.6, w: 3.8, h: 0.6, fill: { color: phase.color }
  });
  slide.addText(phase.title, {
    x, y: 1.6, w: 3.8, h: 0.6,
    fontSize: 14, fontFace: FONT.body, color: "FFFFFF", bold: true,
    align: "center", valign: "middle"
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y: 2.2, w: 3.8, h: 4.5,
    fill: { color: T.bgLight }, line: { color: T.border, width: 0.5 }
  });
  const bullets = phase.items.map((item, j) => ({
    text: item,
    options: { bullet: true, breakLine: j < phase.items.length - 1, fontSize: 14 }
  }));
  slide.addText(bullets, {
    x: x + 0.2, y: 2.5, w: 3.4, h: 4.0,
    fontFace: FONT.body, color: T.textBody, paraSpaceAfter: 8
  });
});
```

### Layout H: Section Divider
```javascript
slide = pres.addSlide();
slide.background = { color: T.secondary };

slide.addText("Section Title", {
  x: 0.8, y: 2.5, w: 11.7, h: 1.5,
  fontSize: 40, fontFace: FONT.header, color: "FFFFFF", bold: true
});
slide.addText("Brief context about what follows", {
  x: 0.8, y: 4.2, w: 8.0, h: 0.6,
  fontSize: 16, fontFace: FONT.body, color: T.bgAlt, italic: true
});
```

### Layout I: Architecture / Layered Diagram
```javascript
slide = pres.addSlide();
slide.background = { color: T.white };

slide.addText("Architecture", {
  x: 0.8, y: 0.5, w: 12, h: 0.8,
  fontSize: 28, fontFace: FONT.header, color: T.primary, bold: true, margin: 0
});

// Use stacked rectangles with different tints for layers
const layers = [
  { label: "HOST", detail: "Node.js process • Telegram listener • SQLite", color: T.bgAlt, y: 1.5 },
  { label: "CONTAINER", detail: "Docker • Claude Agent SDK • MCP tools", color: T.bgLight, y: 3.0 },
  { label: "AGENT", detail: "Skills engine • Full tool access", color: "FFF8E7", y: 4.5 },
];

layers.forEach(layer => {
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 1.0, y: layer.y, w: 11.3, h: 1.2,
    fill: { color: layer.color }, line: { color: T.border, width: 1 }
  });
  slide.addText(layer.label, {
    x: 1.3, y: layer.y + 0.15, w: 3.0, h: 0.4,
    fontSize: 14, fontFace: FONT.body, color: T.secondary, bold: true, margin: 0
  });
  slide.addText(layer.detail, {
    x: 1.3, y: layer.y + 0.55, w: 10.7, h: 0.4,
    fontSize: 12, fontFace: FONT.body, color: T.textMuted, margin: 0
  });
});

// Connector arrows between layers
[2.7, 4.2].forEach(y => {
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 6.3, y, w: 0.08, h: 0.3,
    fill: { color: T.textMuted }
  });
});
```

### Slide Number Helper
```javascript
function addSlideNumber(slide, num) {
  slide.addText(String(num), {
    x: 12.3, y: 7.0, w: 0.7, h: 0.4,
    fontSize: 9, fontFace: FONT.body, color: T.textMuted, align: "right"
  });
}
```

---

## Step 5: Chart Styling

Default charts look dated. Always apply custom styling:

```javascript
slide.addChart(pres.charts.BAR, chartData, {
  x: 0.8, y: 1.5, w: 11, h: 5, barDir: "col",
  chartColors: [T.secondary, T.accent, T.primary],
  chartArea: { fill: { color: T.white }, roundedCorners: true },
  catAxisLabelColor: T.textMuted,
  valAxisLabelColor: T.textMuted,
  valGridLine: { color: T.border, size: 0.5 },
  catGridLine: { style: "none" },
  showValue: true,
  dataLabelPosition: "outEnd",
  dataLabelColor: T.textBody,
  showLegend: false,
});
```

---

## Step 6: Design Rules — MUST FOLLOW

### DO:
1. **1 idea per slide** — split if explaining two things
2. **Max 5 bullets per slide** — walls of text = amateur
3. **Vary layouts** — use at least 3 different layout types (A-I above)
4. **Every slide has a visual** — icon, shape, chart, colored card, or diagram
5. **Dark/light sandwich** — title slide dark, content light, closing dark
6. **Consistent spacing** — 0.5" minimum margins, 0.3-0.5" between blocks
7. **Slide numbers** — every slide, bottom-right, 9pt muted
8. **Left-align body text** — center only titles and KPI values
9. **Use the theme fonts** — header_font for titles, body_font for everything else

### DON'T:
1. **NEVER use accent lines, decorative bars, or colored edge strips AT ANY LEVEL** — hallmark of AI-generated slides. This includes: thin lines under titles, colored bars below title text, vertical colored strips on slide edges OR card edges (left/right/top), horizontal separator lines between items, and any narrow rectangle (< 0.15" wide/tall) whose only purpose is decoration. This rule applies to SLIDES, CARDS, PANELS, and TABLE elements equally. Use `line: { color: T.border, width: 0.5 }` for subtle card outlines if needed — but NEVER a thick colored strip on one edge of a card.
2. **NEVER use emoji or unicode as icons** — they render as "?" boxes. Use react-icons exclusively.
3. **NEVER repeat the same layout** on consecutive slides
4. **NEVER use dot grid patterns** — another AI tell
5. **NEVER center body text** — center only titles and KPI values
6. **NEVER use the same title bar on every content slide** — vary: left panel, top bar, no bar, full-color
7. **NEVER leave > 30% dead space** on any slide
8. **NEVER reuse option objects** — pptxgenjs mutates them. Use factory functions for shadows.
9. **NEVER use `#` in hex colors** — causes file corruption
10. **NEVER use 8-char hex for opacity** — use `opacity` property instead
11. **NEVER use random/different colors for icon circles** — pick ONE theme color for ALL icon backgrounds
12. **NEVER use plain white backgrounds on icon-row or feature slides** — use `T.bgLight` or `T.bgAlt` to add visual warmth. Plain white = flat and forgettable.
13. **NEVER use colored left-border strips on cards** — a tall narrow colored rectangle on the left edge of a card is just an accent line rotated 90°. Same AI tell. If you want to distinguish cards, use different background tints, icons, or subtle full-border outlines — NOT a colored edge strip.

---

## Step 7: Export and QA (MANDATORY — DO NOT SKIP)

### Export
```javascript
await pres.writeFile({ fileName: "/workspace/group/output.pptx" });
```

### Content QA

```bash
python3 -m markitdown /workspace/group/output.pptx
```

Check output for: missing content, typos, wrong slide order, leftover placeholder text.

### Visual QA — REQUIRED before delivering

**Your first render is almost never correct.** Assume there are problems. Your job is to find them.

**Converting PPTX to slide images** (use the `lo-convert` wrapper — it handles HOME and env vars automatically):

```bash
cd /workspace/group
lo-convert pdf output.pptx /workspace/group
rm -f slide-*.jpg
pdftoppm -jpeg -r 150 output.pdf slide
ls -1 "$PWD"/slide-*.jpg
```

> `lo-convert` is a wrapper that sets `HOME=/tmp/lo-home` and `SAL_USE_VCLPLUGIN=svp` for you. Usage: `lo-convert <format> <input-file> [output-dir]`. It is already on PATH.

**⚠️ USE A SUBAGENT (Task tool) for visual inspection** — you've been staring at the code and will see what you expect, not what's there. Subagents have fresh eyes. Use this prompt:

```
Visually inspect these presentation slides. Assume there are issues — find them.

Look for:
- Overlapping elements (text through shapes, lines through words)
- Text overflow or cut off at box boundaries
- Decorative lines under titles OR colored bars/strips on slide edges (AI tell — flag as critical)
- Elements too close (< 0.3" gaps) or cards nearly touching
- Uneven gaps (large empty area in one place, cramped in another)
- Insufficient margin from slide edges (< 0.5")
- Low-contrast text or icons against backgrounds
- Icon circles using different colors (should be ONE consistent color)
- Same layout pattern on consecutive slides
- Any element that looks like default/unstyled output
- Plain white background on feature/icon slides (should use bgLight or bgAlt)
- Colored strips on slide edges OR card edges (accent bar disguised as layout — check left side of every card/panel)
- Horizontal separator lines between content items (another accent line variant)

Read and analyze these images — run `ls -1 /workspace/group/slide-*.jpg` and use the exact absolute paths:
1. /workspace/group/slide-1.jpg — (Expected: [brief description])
2. /workspace/group/slide-2.jpg — (Expected: [brief description])
...

Report ALL issues found, including minor ones.
```

### Verification Loop

1. Generate PPTX → convert to images → subagent inspects
2. **List issues found** (if subagent found zero issues, look again yourself)
3. Fix issues in code
4. **Re-export → re-convert → re-inspect affected slides**
5. Repeat until a full pass reveals no new issues

**Do not declare success until you've completed at least one fix-and-verify cycle.**

---

## Quality Checklist

Before calling `send_file`:
- [ ] Theme auto-selected from design-system (NOT generic blue)
- [ ] Audience determined (internal/external polish level)
- [ ] Font pairing from theme applied (NOT default Arial)
- [ ] Title slide: dark background, large bold title, NO accent lines, NO decorative lines, NO edge bars
- [ ] At least 3 different layout types used
- [ ] Every slide has a visual element (icon, shape, chart, card)
- [ ] Icons rendered via react-icons (NOT emoji)
- [ ] All icon circles use ONE consistent theme color (not random colors per icon)
- [ ] No consecutive slides with same layout
- [ ] Max 5 bullets per slide
- [ ] Body text left-aligned
- [ ] Slide numbers present
- [ ] Content QA passed (markitdown output reviewed)
- [ ] Visual QA passed via subagent (slides converted to images and inspected)
- [ ] No accent lines, decorative bars, or colored edge strips anywhere
- [ ] No plain white backgrounds on feature/icon slides
- [ ] At least one fix-and-verify cycle completed
- [ ] File saved to `/workspace/group/`
