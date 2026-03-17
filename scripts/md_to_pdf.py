"""
Convert CLAUDE_CONTEXT.md to a formatted PDF using fpdf2.
"""

import re
from pathlib import Path
from fpdf import FPDF

MD_PATH = Path(__file__).parent.parent / "docs" / "CLAUDE_CONTEXT.md"
PDF_PATH = Path(__file__).parent.parent / "docs" / "CLAUDE_CONTEXT.pdf"

# ── Colours (project brand) ─────────────────────────────────────────────────
WINE      = (142, 42, 35)   # #8E2A23
DARK_BG   = (22, 12, 10)    # #160C0A  (used as dark heading accent)
TEXT      = (32, 29, 24)    # #201D18
TEXT_MUTE = (115, 109, 101) # #736D65
BORDER    = (221, 217, 210) # #DDD9D2
WHITE     = (255, 255, 255)
OFF_WHITE = (247, 245, 242) # #F7F5F2
TH_TEXT   = (255, 255, 255)

# ── PDF class ────────────────────────────────────────────────────────────────
class ContextPDF(FPDF):
    def __init__(self):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.set_auto_page_break(auto=True, margin=18)
        self.add_page()
        self.set_margins(18, 18, 18)

    # ── header / footer ──────────────────────────────────────────────────────
    def header(self):
        if self.page_no() == 1:
            return
        self.set_fill_color(*WINE)
        self.rect(0, 0, 210, 8, "F")
        self.set_font("Helvetica", "B", 7)
        self.set_text_color(*WHITE)
        self.set_xy(0, 1.5)
        self.cell(0, 5, "AYDT Registration Admin Portal -- Project Context", align="C")
        self.set_text_color(*TEXT)
        self.ln(6)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(*TEXT_MUTE)
        self.cell(0, 5, f"Page {self.page_no()}", align="C")

    # ── helpers ───────────────────────────────────────────────────────────────
    def h1(self, text):
        self.ln(4)
        self.set_fill_color(*WINE)
        self.rect(18, self.get_y(), 174, 10, "F")
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(*WHITE)
        self.set_x(18)
        self.cell(174, 10, text, ln=True)
        self.set_text_color(*TEXT)
        self.ln(2)

    def h2(self, text):
        self.ln(3)
        y = self.get_y()
        self.set_fill_color(*OFF_WHITE)
        self.set_draw_color(*WINE)
        self.rect(18, y, 174, 8, "FD")
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(*WINE)
        self.set_x(18)
        self.cell(174, 8, text, ln=True)
        self.set_text_color(*TEXT)
        self.ln(1)

    def h3(self, text):
        self.ln(2)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(*DARK_BG)
        self.set_x(18)
        self.cell(0, 6, text, ln=True)
        # underline
        y = self.get_y()
        self.set_draw_color(*BORDER)
        self.line(18, y, 192, y)
        self.set_text_color(*TEXT)
        self.ln(1)

    def body(self, text, bold=False, italic=False):
        style = ""
        if bold:   style += "B"
        if italic: style += "I"
        self.set_font("Helvetica", style, 9)
        self.set_text_color(*TEXT)
        self.set_x(18)
        self.multi_cell(174, 5, text)

    def bullet(self, text, level=0):
        indent = 18 + level * 5
        bullet_char = "-" if level == 0 else " -"
        self.set_font("Helvetica", "", 9)
        self.set_text_color(*TEXT)
        self.set_x(indent)
        self.cell(5, 5, bullet_char)
        self.set_x(indent + 5)
        self.multi_cell(174 - (indent - 18) - 5, 5, text)

    def code_line(self, text):
        self.set_font("Courier", "", 8)
        self.set_fill_color(*OFF_WHITE)
        self.set_text_color(*DARK_BG)
        self.set_x(18)
        self.cell(174, 5, text, fill=True, ln=True)

    def hr(self):
        self.ln(2)
        y = self.get_y()
        self.set_draw_color(*BORDER)
        self.line(18, y, 192, y)
        self.ln(3)


# ── Markdown parser ──────────────────────────────────────────────────────────

def sanitize(text):
    """Replace non-latin-1 characters with ASCII equivalents."""
    replacements = {
        "\u2014": "--",   # em dash
        "\u2013": "-",    # en dash
        "\u2018": "'",    # left single quote
        "\u2019": "'",    # right single quote
        "\u201c": '"',    # left double quote
        "\u201d": '"',    # right double quote
        "\u2022": "*",    # bullet
        "\u2026": "...",  # ellipsis
        "\u00e9": "e",    # e acute
        "\u00e0": "a",    # a grave
        "\u00fc": "ue",   # u umlaut
        "\u2192": "->",   # right arrow
        "\u2190": "<-",   # left arrow
        "\u00d7": "x",    # multiplication sign
        "\u00b0": "deg",  # degree
        "\u2713": "v",    # check mark
        "\u2714": "v",    # heavy check mark
        "\u2715": "x",    # multiplication x
        "\u2764": "<3",   # heart
    }
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    # drop any remaining non-latin-1
    return text.encode("latin-1", errors="replace").decode("latin-1")


def strip_inline(text):
    """Remove markdown inline formatting for plain rendering."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    return sanitize(text.strip())

def parse_table(lines):
    """Return list of rows; first row is header."""
    rows = []
    for line in lines:
        if re.match(r"^\s*\|[-:| ]+\|\s*$", line):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        rows.append(cells)
    return rows

def render_table(pdf: ContextPDF, rows):
    if not rows:
        return
    pdf.ln(2)
    page_w = 174
    # even column distribution
    n_cols = max(len(r) for r in rows)
    if n_cols == 0:
        return
    col_w = page_w / n_cols

    for i, row in enumerate(rows):
        is_header = (i == 0)
        x = 18
        y = pdf.get_y()
        # measure row height
        max_h = 6
        for cell in row:
            pdf.set_font("Helvetica", "B" if is_header else "", 8)
            lines_needed = pdf.get_string_width(strip_inline(cell)) / (col_w - 4)
            h = max(6, int(lines_needed + 1) * 5)
            max_h = max(max_h, h)
        # check page break
        if y + max_h > pdf.h - 20:
            pdf.add_page()
            x = 18
            y = pdf.get_y()

        for j, cell in enumerate(row):
            cx = x + j * col_w
            if is_header:
                pdf.set_fill_color(*WINE)
                pdf.set_text_color(*WHITE)
                pdf.set_font("Helvetica", "B", 8)
            else:
                fill = i % 2 == 0
                pdf.set_fill_color(*OFF_WHITE if fill else WHITE)
                pdf.set_text_color(*TEXT)
                pdf.set_font("Helvetica", "", 8)
            pdf.set_draw_color(*BORDER)
            pdf.set_xy(cx, y)
            pdf.multi_cell(col_w, max_h / max(1, (max_h // 5)), strip_inline(cell),
                           border=1, fill=True, align="L")
            pdf.set_xy(x + (j + 1) * col_w, y)
        pdf.set_xy(18, y + max_h)
    pdf.ln(2)


def render_code_block(pdf: ContextPDF, lines):
    pdf.ln(1)
    pdf.set_fill_color(*OFF_WHITE)
    pdf.set_draw_color(*BORDER)
    start_y = pdf.get_y()
    for line in lines:
        # expand tabs
        line = line.replace("\t", "    ")
        pdf.set_font("Courier", "", 7.5)
        pdf.set_fill_color(*OFF_WHITE)
        pdf.set_text_color(*DARK_BG)
        pdf.set_x(18)
        pdf.cell(174, 4.5, sanitize(line) if line else " ", fill=True, ln=True)
    end_y = pdf.get_y()
    pdf.set_draw_color(*BORDER)
    pdf.rect(18, start_y, 174, end_y - start_y)
    pdf.ln(2)


def convert(md_text: str, pdf: ContextPDF):
    lines = md_text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]

        # ── horizontal rule ───────────────────────────────────────────────
        if re.match(r"^---+\s*$", line):
            pdf.hr()
            i += 1
            continue

        # ── fenced code block ──────────────────────────────────────────────
        if line.startswith("```"):
            i += 1
            code_lines = []
            while i < len(lines) and not lines[i].startswith("```"):
                code_lines.append(lines[i])
                i += 1
            render_code_block(pdf, code_lines)
            i += 1
            continue

        # ── table ─────────────────────────────────────────────────────────
        if line.startswith("|"):
            table_lines = []
            while i < len(lines) and lines[i].startswith("|"):
                table_lines.append(lines[i])
                i += 1
            render_table(pdf, parse_table(table_lines))
            continue

        # ── headings ──────────────────────────────────────────────────────
        m = re.match(r"^(#{1,3})\s+(.*)", line)
        if m:
            level = len(m.group(1))
            text = strip_inline(m.group(2))
            if level == 1:
                pdf.h1(text)
            elif level == 2:
                pdf.h2(text)
            else:
                pdf.h3(text)
            i += 1
            continue

        # ── bullet list ───────────────────────────────────────────────────
        m = re.match(r"^(\s*)[-*]\s+(.*)", line)
        if m:
            indent_lvl = len(m.group(1)) // 2
            text = strip_inline(m.group(2))
            pdf.bullet(text, level=indent_lvl)
            i += 1
            continue

        # ── numbered list ─────────────────────────────────────────────────
        m = re.match(r"^(\s*)\d+\.\s+(.*)", line)
        if m:
            indent_lvl = len(m.group(1)) // 2
            text = strip_inline(m.group(2))
            pdf.bullet(text, level=indent_lvl)
            i += 1
            continue

        # ── blank line ────────────────────────────────────────────────────
        if not line.strip():
            pdf.ln(2)
            i += 1
            continue

        # ── regular paragraph ─────────────────────────────────────────────
        pdf.body(strip_inline(line))
        i += 1


def main():
    md_text = MD_PATH.read_text(encoding="utf-8")
    pdf = ContextPDF()

    # Cover page
    pdf.set_fill_color(*WINE)
    pdf.rect(0, 0, 210, 297, "F")
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_text_color(*WHITE)
    pdf.set_xy(18, 100)
    pdf.multi_cell(174, 12, "AYDT Registration\nAdmin Portal", align="C")
    pdf.set_font("Helvetica", "", 14)
    pdf.set_xy(18, 140)
    pdf.cell(174, 8, "Project Context Reference", align="C",
             new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(255, 200, 195)
    pdf.set_xy(18, 160)
    pdf.cell(174, 6, "For UI brainstorming with AI assistants", align="C",
             new_x="LMARGIN", new_y="NEXT")

    # Content pages
    pdf.add_page()
    convert(md_text, pdf)

    pdf.output(str(PDF_PATH))
    print(f"PDF saved → {PDF_PATH}")


if __name__ == "__main__":
    main()
