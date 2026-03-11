# Handle Incoming Files

When users send files via Telegram, they are mounted read-only at `/workspace/uploads/`.
The prompt will tell you exactly which files are available and their types.

## How to Process Each File Type

### Images (.jpg, .png, .webp, .gif, .bmp)
Use the `Read` tool directly — Claude has native vision:
```
Read /workspace/uploads/photo_1234567890.jpg
```
Describe what you see, extract text (OCR), analyze charts, etc.

### PDFs (.pdf)
Use the `Read` tool — Claude has native PDF support:
```
Read /workspace/uploads/document.pdf
```
For table extraction, use Python:
```python
import pdfplumber
with pdfplumber.open("/workspace/uploads/document.pdf") as pdf:
    for page in pdf.pages:
        tables = page.extract_tables()
        text = page.extract_text()
```

### Word Documents (.docx)
```python
from docx import Document
doc = Document("/workspace/uploads/report.docx")
for para in doc.paragraphs:
    print(para.text)
# Tables:
for table in doc.tables:
    for row in table.rows:
        print([cell.text for cell in row.cells])
```

### Excel Spreadsheets (.xlsx, .xls)
```python
import pandas as pd
df = pd.read_excel("/workspace/uploads/data.xlsx")
print(df.head())
print(df.describe())
```
Or with openpyxl for formatting details:
```python
import openpyxl
wb = openpyxl.load_workbook("/workspace/uploads/data.xlsx")
ws = wb.active
for row in ws.iter_rows(values_only=True):
    print(row)
```

### CSV / Text Files (.csv, .txt, .md, .json)
```python
import pandas as pd
df = pd.read_csv("/workspace/uploads/data.csv")
```
Or read directly:
```
Read /workspace/uploads/notes.txt
```

### Audio / Voice (.ogg, .mp3, .wav)
Audio transcription is not yet available. Acknowledge receipt and let the user know.

## Important Notes
- Files at `/workspace/uploads/` are **read-only** — copy to `/workspace/group/` if you need to modify
- Always acknowledge what file you received before processing
- For large files, process incrementally (e.g., read first few pages of a long PDF)
- When creating output based on an input file, use the `send_file` MCP tool to deliver results
