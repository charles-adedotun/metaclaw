# Create PDF Documents

**PREREQUISITE:** Read `/home/node/.claude/skills/design-system/SKILL.md` FIRST. It defines the design philosophy, theme system, and document archetypes you MUST follow. This skill handles implementation only.

You have Python 3 with `reportlab`, `pillow`, and `pdfplumber` globally installed.

---

## Step 1: Design Before Code

Before writing ANY reportlab code:
1. Identify the document archetype (resume? report? invoice? letter? dashboard?)
2. Select the appropriate theme from the design system
3. Plan the page layout on paper mentally — where does each element go?
4. Only THEN start coding

---

## Step 2: Theme Integration

The design system defines themes with these keys:
```
primary, secondary, accent, bg_light, bg_alt,
text_body, text_muted, border,
header_font, body_font
```

Map them to reportlab like this:

```python
from reportlab.lib.colors import HexColor

# Example: Executive theme (adapt colors from design-system SKILL.md)
THEME = {
    "primary":    HexColor("#1B2A4A"),
    "secondary":  HexColor("#2E5090"),
    "accent":     HexColor("#C8A97E"),
    "bg_light":   HexColor("#F8F6F3"),
    "bg_alt":     HexColor("#EEF1F5"),
    "text_body":  HexColor("#2D3436"),
    "text_muted": HexColor("#6B7B8D"),
    "border":     HexColor("#D5DAE0"),
}
```

---

## Step 3: Archetype Templates

### Resume / CV Template

```python
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import inch, mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether, ListFlowable, ListItem
)
from reportlab.lib import colors
import datetime

# --- THEME (select from design-system) ---
PRIMARY = HexColor("#1B2A4A")
SECONDARY = HexColor("#2E5090")
ACCENT = HexColor("#C8A97E")
BG_ALT = HexColor("#EEF1F5")
TEXT_BODY = HexColor("#2D3436")
TEXT_MUTED = HexColor("#6B7B8D")
BORDER = HexColor("#D5DAE0")

# --- STYLES ---
styles = getSampleStyleSheet()

# Name — LARGE, clear, dominant
styles.add(ParagraphStyle('Name',
    fontName='Helvetica-Bold', fontSize=28, textColor=PRIMARY,
    spaceAfter=4, leading=34, alignment=TA_LEFT))

# Professional title — below name, lighter, NEVER overlapping
styles.add(ParagraphStyle('ProTitle',
    fontName='Helvetica', fontSize=14, textColor=SECONDARY,
    spaceBefore=2, spaceAfter=4, leading=18))

# Contact row — small, muted, single line
styles.add(ParagraphStyle('Contact',
    fontName='Helvetica', fontSize=9, textColor=TEXT_MUTED,
    spaceAfter=16, leading=12))

# Section header — bold, accent-colored, with visual separator
styles.add(ParagraphStyle('SectionHead',
    fontName='Helvetica-Bold', fontSize=12, textColor=PRIMARY,
    spaceBefore=18, spaceAfter=6, leading=15,
    borderColor=SECONDARY, borderWidth=0, borderPadding=0))

# Job title line — company + role pair
styles.add(ParagraphStyle('JobTitle',
    fontName='Helvetica-Bold', fontSize=11, textColor=TEXT_BODY,
    spaceBefore=8, spaceAfter=1, leading=14))

# Job meta — dates, location (right-aligned or muted)
styles.add(ParagraphStyle('JobMeta',
    fontName='Helvetica-Oblique', fontSize=9, textColor=TEXT_MUTED,
    spaceAfter=4, leading=12))

# Body / bullet text
styles.add(ParagraphStyle('Body',
    fontName='Helvetica', fontSize=10, textColor=TEXT_BODY,
    leading=14, spaceAfter=3))

styles.add(ParagraphStyle('Bullet',
    fontName='Helvetica', fontSize=10, textColor=TEXT_BODY,
    leading=14, leftIndent=16, bulletIndent=6, spaceAfter=2))

# Skill tag style
styles.add(ParagraphStyle('SkillTag',
    fontName='Helvetica', fontSize=9, textColor=SECONDARY,
    leading=12))

def cv_header_footer(canvas, doc):
    """Minimal CV footer — just page number if multi-page"""
    canvas.saveState()
    if doc.page > 1:
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(TEXT_MUTED)
        canvas.drawCentredString(letter[0]/2, 0.4*inch, f"Page {doc.page}")
    canvas.restoreState()

# --- BUILD ---
doc = SimpleDocTemplate("/workspace/group/cv.pdf", pagesize=letter,
    topMargin=0.7*inch, bottomMargin=0.6*inch,
    leftMargin=0.8*inch, rightMargin=0.8*inch)

story = []

# Name block (LARGE, dominant)
story.append(Paragraph("CANDIDATE NAME", styles['Name']))
# Title (clearly separated — spaceBefore prevents overlap)
story.append(Paragraph("Professional Title | Specialization", styles['ProTitle']))
# Contact (compact single line)
story.append(Paragraph("email@example.com  •  +1 XXX XXX XXXX  •  City, Country  •  linkedin.com/in/name", styles['Contact']))
# Accent line separator
story.append(HRFlowable(width="100%", thickness=1.5, color=SECONDARY, spaceAfter=12))

# --- PROFESSIONAL SUMMARY ---
story.append(Paragraph("PROFESSIONAL SUMMARY", styles['SectionHead']))
story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=8))
story.append(Paragraph("Concise 2-3 sentence summary of experience, expertise, and career focus.", styles['Body']))
story.append(Spacer(1, 6))

# --- EXPERIENCE ---
story.append(Paragraph("EXPERIENCE", styles['SectionHead']))
story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=8))

# Each role as a KeepTogether block (prevents ugly page breaks mid-role)
role = []
role.append(Paragraph("Company Name — <b>Job Title</b>", styles['JobTitle']))
role.append(Paragraph("Jan 2022 – Present  •  Location", styles['JobMeta']))
role.append(Paragraph("• Led cross-functional team of 12 engineers to deliver platform migration", styles['Bullet']))
role.append(Paragraph("• Reduced infrastructure costs by 40% through Kubernetes optimization", styles['Bullet']))
role.append(Paragraph("• Designed CI/CD pipeline serving 200+ deployments per week", styles['Bullet']))
story.append(KeepTogether(role))

# --- SKILLS (compact grid, not long list) ---
story.append(Spacer(1, 6))
story.append(Paragraph("SKILLS", styles['SectionHead']))
story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=8))

# Skills as a table grid (more professional than bullet list)
skill_data = [
    ["Kubernetes", "Docker", "Terraform", "AWS"],
    ["Python", "Go", "Node.js", "TypeScript"],
    ["CI/CD", "Prometheus", "Grafana", "Linux"],
]
skill_table = Table(skill_data, colWidths=[1.6*inch]*4)
skill_table.setStyle(TableStyle([
    ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
    ('FONTSIZE', (0,0), (-1,-1), 9),
    ('TEXTCOLOR', (0,0), (-1,-1), SECONDARY),
    ('BACKGROUND', (0,0), (-1,-1), BG_ALT),
    ('TOPPADDING', (0,0), (-1,-1), 6),
    ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ('LEFTPADDING', (0,0), (-1,-1), 10),
    ('ALIGN', (0,0), (-1,-1), 'LEFT'),
    ('GRID', (0,0), (-1,-1), 0.5, BORDER),
    ('ROUNDEDCORNERS', [2, 2, 2, 2]),
]))
story.append(skill_table)

# --- EDUCATION ---
story.append(Spacer(1, 6))
story.append(Paragraph("EDUCATION", styles['SectionHead']))
story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=8))
story.append(Paragraph("University Name — <b>Degree, Field of Study</b>", styles['JobTitle']))
story.append(Paragraph("2016 – 2020", styles['JobMeta']))

doc.build(story, onFirstPage=cv_header_footer, onLaterPages=cv_header_footer)
```

### Business Report Template

```python
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
import datetime

# --- THEME ---
PRIMARY = HexColor("#1B2A4A")
SECONDARY = HexColor("#2E5090")
ACCENT = HexColor("#C8A97E")
BG_LIGHT = HexColor("#F8F6F3")
BG_ALT = HexColor("#EEF1F5")
TEXT_BODY = HexColor("#2D3436")
TEXT_MUTED = HexColor("#6B7B8D")
BORDER = HexColor("#D5DAE0")
WHITE = white
TODAY = datetime.date.today().strftime("%B %d, %Y")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle('DocTitle', fontName='Helvetica-Bold', fontSize=26,
    textColor=PRIMARY, spaceAfter=6, leading=32))
styles.add(ParagraphStyle('Subtitle', fontName='Helvetica', fontSize=11,
    textColor=TEXT_MUTED, spaceAfter=24))
styles.add(ParagraphStyle('H1', fontName='Helvetica-Bold', fontSize=16,
    textColor=PRIMARY, spaceBefore=28, spaceAfter=10, leading=20))
styles.add(ParagraphStyle('H2', fontName='Helvetica-Bold', fontSize=13,
    textColor=SECONDARY, spaceBefore=18, spaceAfter=8, leading=16))
styles.add(ParagraphStyle('Body', fontName='Helvetica', fontSize=11,
    textColor=TEXT_BODY, leading=15.5, spaceAfter=8))
styles.add(ParagraphStyle('Bullet', fontName='Helvetica', fontSize=11,
    textColor=TEXT_BODY, leading=15.5, leftIndent=24, bulletIndent=12, spaceAfter=4))
styles.add(ParagraphStyle('FooterStyle', fontName='Helvetica', fontSize=8,
    textColor=TEXT_MUTED, alignment=TA_CENTER))

def header_footer(canvas, doc):
    canvas.saveState()
    # Header: subtle accent line + doc title + date
    canvas.setStrokeColor(SECONDARY)
    canvas.setLineWidth(1.5)
    canvas.line(inch, letter[1] - 0.6*inch, letter[0] - inch, letter[1] - 0.6*inch)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(inch, letter[1] - 0.52*inch, "DOCUMENT TITLE")
    canvas.drawRightString(letter[0] - inch, letter[1] - 0.52*inch, TODAY)
    # Footer: page number
    canvas.drawCentredString(letter[0]/2, 0.45*inch, f"Page {doc.page}")
    canvas.restoreState()

doc = SimpleDocTemplate("/workspace/group/report.pdf", pagesize=letter,
    topMargin=inch, bottomMargin=0.8*inch,
    leftMargin=inch, rightMargin=inch)
story = []

# Title block
story.append(Paragraph("Report Title", styles['DocTitle']))
story.append(HRFlowable(width="100%", thickness=2, color=SECONDARY, spaceAfter=4))
story.append(Paragraph(f"Prepared by Andy  •  {TODAY}", styles['Subtitle']))

# Sections
story.append(Paragraph("Section Heading", styles['H1']))
story.append(Paragraph("Body text goes here. Use 11pt Helvetica with clear leading for readability. Keep paragraphs focused and concise.", styles['Body']))

# Bullets
story.append(Paragraph("&bull; First key point with supporting detail", styles['Bullet']))
story.append(Paragraph("&bull; Second point — note the em dash, not hyphen", styles['Bullet']))

# Table with proper styling
table_data = [
    ["Metric", "Value", "Status"],
    ["Uptime", "99.9%", "Healthy"],
    ["Response Time", "45ms", "Good"],
    ["Error Rate", "0.02%", "Normal"],
]
t = Table(table_data, colWidths=[2.2*inch]*3)
t.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), SECONDARY),
    ('TEXTCOLOR', (0,0), (-1,0), WHITE),
    ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
    ('FONTSIZE', (0,0), (-1,0), 10),
    ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
    ('FONTSIZE', (0,1), (-1,-1), 10),
    ('TEXTCOLOR', (0,1), (-1,-1), TEXT_BODY),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [WHITE, BG_ALT]),
    ('GRID', (0,0), (-1,-1), 0.5, BORDER),
    ('TOPPADDING', (0,0), (-1,-1), 8),
    ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ('LEFTPADDING', (0,0), (-1,-1), 10),
]))
story.append(Spacer(1, 12))
story.append(t)

doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
```

---

## Step 4: Implementation Rules

### Text Safety
- ALWAYS use `KeepTogether()` for multi-line blocks that shouldn't split across pages
- ALWAYS add `spaceBefore` AND `spaceAfter` to prevent overlapping
- NEVER use raw unicode symbols (▪, •, ►) — use `&bull;` entity or `ListFlowable`
- NEVER use unicode superscripts/subscripts — use `<sub>` and `<super>` tags in Paragraph

### Page Management
- Check if content fits: if page 2 is less than 40% filled, reformat to fit on page 1
- Use `PageBreak()` intentionally, never rely on auto-breaks for section starts
- Set `topMargin` and `bottomMargin` to at least 0.6 inches

### Table Safety
- Always set explicit `colWidths` — never let reportlab auto-calculate for important tables
- Use `TOPPADDING` and `BOTTOMPADDING` of at least 6-8 for readability
- Header row: theme's `secondary` color with white text
- Alternating rows: white and theme's `bg_alt`

### File Output
- Always save to `/workspace/group/` before calling `send_file`
- Use descriptive filenames: `quarterly-report-2026-Q1.pdf` not `output.pdf`

---

## Quality Checklist (from Design System)
Before calling `send_file`, verify:
- [ ] Read design-system SKILL.md and identified archetype + theme
- [ ] Title has clear visual dominance (largest element on page)
- [ ] NO text overlaps anywhere (especially headers, names, titles)
- [ ] NO half-empty pages — redistribute content or reduce pages
- [ ] Consistent spacing between all equivalent sections
- [ ] Maximum 3 colors used (plus neutrals)
- [ ] Maximum 2 fonts used
- [ ] Tables have generous padding and clear header rows
- [ ] Page numbers present (footer) on multi-page documents
- [ ] File saved to `/workspace/group/`
