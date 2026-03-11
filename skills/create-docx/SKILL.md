# Create Word Documents (.docx)

**PREREQUISITE:** Read `/home/node/.claude/skills/design-system/SKILL.md` FIRST. It defines the design philosophy, theme system, and document archetypes you MUST follow. This skill handles implementation only.

You have `docx` (npm, globally installed) and `NODE_PATH=/usr/local/lib/node_modules`.

---

## Step 1: Design Before Code

Before writing ANY code:
1. Identify the document archetype from the design system (resume? report? letter? invoice?)
2. Select the appropriate theme
3. Plan the layout mentally
4. THEN start coding

---

## Step 2: Theme Integration

Map design-system themes to docx colors (hex strings without #):

```javascript
// Example: Executive theme
const THEME = {
  primary:   "1B2A4A",
  secondary: "2E5090",
  accent:    "C8A97E",
  bgLight:   "F8F6F3",
  bgAlt:     "EEF1F5",
  textBody:  "2D3436",
  textMuted: "6B7B8D",
  border:    "D5DAE0",
};
```

---

## Step 3: Base Document Structure

```javascript
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Header, Footer,
        AlignmentType, HeadingLevel, PageNumber, TabStopType, TabStopPosition,
        BorderStyle, LevelFormat, Table, TableRow, TableCell,
        WidthType, ShadingType, ImageRun } = require('docx');

// --- THEME (adapt from design-system) ---
const T = {
  primary:   "1B2A4A",
  secondary: "2E5090",
  accent:    "C8A97E",
  bgAlt:     "EEF1F5",
  textBody:  "2D3436",
  textMuted: "6B7B8D",
  border:    "D5DAE0",
};

const doc = new Document({
  creator: "Andy — Chief of Staff",
  title: "DOCUMENT_TITLE",
  styles: {
    default: {
      document: {
        run: { font: "Arial", size: 22, color: T.textBody },     // 11pt
        paragraph: { spacing: { line: 276 } }                     // 1.15x
      }
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal",
        quickFormat: true,
        run: { size: 40, bold: true, font: "Arial", color: T.primary },     // 20pt
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 }
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal",
        quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: T.secondary },   // 14pt
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 }
      },
    ]
  },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "\u2022",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } }
      }]
    }, {
      reference: "numbers",
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: "%1.",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } }
      }]
    }]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: T.secondary, space: 4 } },
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          children: [
            new TextRun({ text: "DOCUMENT TITLE", font: "Arial", size: 18, color: T.textMuted }),
            new TextRun({ text: "\tDATE_HERE", font: "Arial", size: 18, color: T.textMuted }),
          ]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Page ", font: "Arial", size: 18, color: T.textMuted }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: T.textMuted }),
          ]
        })]
      })
    },
    children: [
      // TITLE — large, bold, dominant
      new Paragraph({
        spacing: { after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: T.secondary, space: 8 } },
        children: [new TextRun({ text: "Document Title", bold: true, size: 56, font: "Arial", color: T.primary })]
      }),
      // Subtitle / date
      new Paragraph({
        spacing: { after: 400 },
        children: [new TextRun({ text: `Prepared by Andy • DATE`, size: 20, font: "Arial", color: T.textMuted, italics: true })]
      }),
      // H1
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Section Title")] }),
      // Body
      new Paragraph({ children: [new TextRun("Body paragraph text here.")] }),
      // Bullets — ALWAYS use numbering reference, NEVER unicode bullets
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("First bullet point")]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buf => fs.writeFileSync("/workspace/group/output.docx", buf));
```

---

## Step 4: Table Styling

```javascript
const headerBg = T.secondary;
const headerText = "FFFFFF";
const altRowBg = T.bgAlt;
const bdr = { style: BorderStyle.SINGLE, size: 1, color: T.border };
const borders = { top: bdr, bottom: bdr, left: bdr, right: bdr };

// Header row
new TableRow({
  children: ["Column A", "Column B"].map(text =>
    new TableCell({
      borders,
      width: { size: 4680, type: WidthType.DXA },
      shading: { fill: headerBg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({
        children: [new TextRun({ text, bold: true, color: headerText, font: "Arial", size: 20 })]
      })]
    })
  )
})
// Data rows: even rows get altRowBg, odd rows stay white
```

---

## Step 5: Archetype-Specific Guidance

### For CVs / Resumes:
- Title (name) at 28pt, professional title at 14pt with `spacing: { before: 40, after: 100 }`
- NEVER let name and title share the same spacing block — they need explicit separation
- Use `Table` for skill grids instead of bullet lists
- Right-align dates using `tabStops` in experience entries

### For Reports:
- Use the standard template above
- Add table of contents if 5+ pages: leverage Heading1/Heading2 styles
- Charts: generate as PNG first, embed with `ImageRun`

### For Letters:
- Sender info top-right, date below, recipient left-aligned
- Body paragraphs with `spacing: { after: 200 }` for letter-appropriate line breaks
- Sign-off: "Sincerely," followed by 3-line space, then name

---

## Quality Checklist (from Design System)
Before calling `send_file`:
- [ ] Read design-system SKILL.md and identified archetype + theme
- [ ] Title is visually dominant (28pt bold)
- [ ] NO text overlaps (explicit spacing on all elements)
- [ ] Header has doc title + date with subtle bottom rule
- [ ] Footer has centered page number
- [ ] Body is 11pt Arial with proper color
- [ ] Tables have themed header row with white text
- [ ] Bullet lists use numbering config, NEVER unicode
- [ ] Consistent spacing throughout
- [ ] File saved to `/workspace/group/`
