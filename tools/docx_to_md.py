#!/usr/bin/env python3
"""
Minimal DOCX → Markdown converter focused on paragraphs, headings, and lists.
It parses WordprocessingML directly (no external deps) and outputs basic GFM.

Limitations:
- Hyperlinks, images, and tables are not preserved (text only).
- Numbered list values are rendered as generic ordered markers ("1.").
- Character-level styles (bold/italic) are not preserved.
"""

from __future__ import annotations

import sys
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

N = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
}


def text_from_runs(p):
    parts = []
    # handle text nodes and line breaks
    for r in p.findall('.//w:r', N):
        # explicit line break
        if r.find('w:br', N) is not None:
            parts.append('\n')
        t = r.find('w:t', N)
        if t is not None and t.text:
            parts.append(t.text)
    # Also handle field simple content if present
    for fld in p.findall('.//w:fldSimple', N):
        fld_text = ''.join(t.text or '' for t in fld.findall('.//w:t', N))
        if fld_text:
            parts.append(fld_text)
    return ''.join(parts).strip()


def read_styles(z: ZipFile):
    styles = {}
    try:
        with z.open('word/styles.xml') as f:
            root = ET.parse(f).getroot()
        for s in root.findall('w:style', N):
            style_id = s.get(f'{{{N["w"]}}}styleId')
            name_el = s.find('w:name', N)
            name = name_el.get(f'{{{N["w"]}}}val') if name_el is not None else ''
            styles[style_id] = name
    except KeyError:
        pass
    return styles


def read_numbering(z: ZipFile):
    """
    Return two dicts:
    - numId_to_abstract: map numId -> abstractNumId
    - abstract_to_fmt: map (abstractNumId, ilvl) -> numFmt (e.g., 'bullet' or 'decimal')
    """
    numId_to_abstract = {}
    abstract_to_fmt = {}
    try:
        with z.open('word/numbering.xml') as f:
            root = ET.parse(f).getroot()
        for num in root.findall('w:num', N):
            numId = num.get(f'{{{N["w"]}}}numId')
            abs_el = num.find('w:abstractNumId', N)
            if numId and abs_el is not None:
                abstract = abs_el.get(f'{{{N["w"]}}}val')
                numId_to_abstract[numId] = abstract
        for abs_num in root.findall('w:abstractNum', N):
            abstract = abs_num.get(f'{{{N["w"]}}}abstractNumId')
            for lvl in abs_num.findall('w:lvl', N):
                ilvl = lvl.get(f'{{{N["w"]}}}ilvl') or '0'
                fmt_el = lvl.find('w:numFmt', N)
                fmt = fmt_el.get(f'{{{N["w"]}}}val') if fmt_el is not None else 'bullet'
                abstract_to_fmt[(abstract, ilvl)] = fmt
    except KeyError:
        pass
    return numId_to_abstract, abstract_to_fmt


def para_style(p):
    pPr = p.find('w:pPr', N)
    if pPr is None:
        return None
    pStyle = pPr.find('w:pStyle', N)
    if pStyle is None:
        return None
    return pStyle.get(f'{{{N["w"]}}}val')


def heading_level(style_id: str, styles_map: dict) -> int | None:
    if not style_id:
        return None
    name = styles_map.get(style_id, '')
    # Prefer styleId patterns like Heading1, heading1
    for src in (style_id, name):
        s = (src or '').lower()
        if s.startswith('heading'):
            # find first digit
            digits = ''.join(ch for ch in src if ch.isdigit())
            if digits:
                try:
                    lvl = int(digits)
                    return max(1, min(lvl, 6))
                except ValueError:
                    pass
            return 1
    return None


def list_info(p, numId_to_abstract, abstract_to_fmt):
    pPr = p.find('w:pPr', N)
    if pPr is None:
        return None
    numPr = pPr.find('w:numPr', N)
    if numPr is None:
        return None
    ilvl_el = numPr.find('w:ilvl', N)
    numId_el = numPr.find('w:numId', N)
    if numId_el is None:
        return None
    ilvl = (ilvl_el.get(f'{{{N["w"]}}}val') if ilvl_el is not None else '0')
    numId = numId_el.get(f'{{{N["w"]}}}val')
    abstract = numId_to_abstract.get(numId)
    fmt = abstract_to_fmt.get((abstract, ilvl), 'bullet')
    kind = 'ul' if fmt == 'bullet' else 'ol'
    return kind, int(ilvl)


def convert(docx_path: Path) -> str:
    with ZipFile(docx_path) as z:
        styles = read_styles(z)
        numId_to_abstract, abstract_to_fmt = read_numbering(z)
        with z.open('word/document.xml') as f:
            root = ET.parse(f).getroot()

    out_lines = []
    prev_was_block = False

    for p in root.findall('.//w:body/w:p', N):
        txt = text_from_runs(p)
        if not txt:
            continue

        # heading?
        style_id = para_style(p)
        h = heading_level(style_id, styles)
        if h:
            if out_lines and out_lines[-1] != '':
                out_lines.append('')
            out_lines.append('#' * h + ' ' + txt)
            out_lines.append('')
            prev_was_block = True
            continue

        # list?
        li = list_info(p, numId_to_abstract, abstract_to_fmt)
        if li:
            kind, lvl = li
            indent = '  ' * lvl
            bullet = '-' if kind == 'ul' else '1.'
            out_lines.append(f"{indent}{bullet} {txt}")
            prev_was_block = False
            continue

        # normal paragraph
        if out_lines and out_lines[-1] != '':
            out_lines.append('')
        out_lines.append(txt)
        out_lines.append('')
        prev_was_block = True

    # Ensure single trailing newline
    while out_lines and out_lines[-1] == '':
        out_lines.pop()
    return '\n'.join(out_lines) + '\n'


def main():
    if len(sys.argv) < 3:
        print('Usage: docx_to_md.py <input.docx> <output.md>')
        sys.exit(2)
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    md = convert(src)
    dst.write_text(md, encoding='utf-8')


if __name__ == '__main__':
    main()

