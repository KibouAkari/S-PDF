"""Generate harmless synthetic fixtures for live browser acceptance tests."""
from pathlib import Path
import fitz
from PIL import Image
from docx import Document

out = Path("/tmp/s-pdf-browser-fixtures")
out.mkdir(parents=True, exist_ok=True)

pdf = fitz.open()
for i in (1, 2):
    page = pdf.new_page(width=420, height=595)
    page.insert_text((40, 80), f"S-PDF BROWSER PAGE {i}", fontsize=15)
pdf.save(out / "synthetic.pdf")
pdf.close()

word = Document()
word.add_heading("S-PDF BROWSER DOCX", level=1)
word.add_paragraph("A minimal generated Word file for automated conversion testing.")
word.save(out / "synthetic.docx")

for fmt in ("PNG", "JPEG", "WEBP"):
    img = Image.new("RGB", (96, 64), (48, 140, 210))
    img.save(out / ("synthetic." + ("jpg" if fmt == "JPEG" else fmt.lower())), format=fmt)

print("Generated synthetic test fixtures under", out)
