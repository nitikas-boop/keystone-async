"""POST /documents with files that have no front-matter: stored as a dated plain document, or refused with the reason."""
import io

import docx
import httpx
import pytest
from pypdf import PdfWriter

from app import ingest

H = {'X-User': 'nitika'}


def blank_pdf() -> bytes:
    w, out = PdfWriter(), io.BytesIO()
    w.add_blank_page(200, 200)
    w.write(out)
    return out.getvalue()


def word(text: str) -> bytes:
    d, out = docx.Document(), io.BytesIO()
    d.add_paragraph(text)
    d.save(out)
    return out.getvalue()


def test_text_of_refuses_what_the_engine_cannot_read():
    for name, data, reason in [('sheet.xlsx', b'PK', 'not supported'), ('noext', b'x', 'not supported'),
                               ('scan.pdf', blank_pdf(), 'no text'), ('broken.pdf', b'not a pdf', 'could not be read'),
                               ('latin1.txt', 'caf\xe9'.encode('latin-1'), 'not UTF-8'), ('empty.md', b'  \n', 'no text')]:
        with pytest.raises(ValueError, match=reason):
            ingest.text_of(name, data)
    assert ingest.text_of('a.docx', word('Vendor terms: 30 days.')) == 'Vendor terms: 30 days.'
    assert ingest.text_of('a.md', '﻿# Hi'.encode()) == '# Hi'  # a BOM must not hide front-matter
    assert ingest.doc_id_for('Team/Q3 vendor-review.pdf') == 'DOC-Q3-VENDOR-REVIEW'


def test_upload_plain_documents(api):
    post = lambda name, data, **form: httpx.post(f'{api}/documents', files={'file': (name, data)}, data=form,
                                                 headers=H, timeout=600)
    r = post('deck.pptx', b'PK')
    assert r.status_code == 422 and 'not supported' in r.text
    r = post('scan.pdf', blank_pdf(), doc_date='2025-03-01')
    assert r.status_code == 422 and 'no text' in r.text
    r = post('T-PLAIN.txt', b'The vendor review moved to quarterly.')
    assert r.status_code == 422 and 'doc_date' in r.text  # no date, no guess

    r = post('T-PLAIN-TERMS.docx', word('Zorbex vendor terms: invoices are paid within 30 days.'),
             doc_date='2025-03-01', title='Zorbex vendor terms')
    assert r.status_code == 201, r.text
    out = r.json()
    assert (out['document_id'], out['doc_type'], out['ref_time']) == ('DOC-T-PLAIN-TERMS', 'meeting_note', '2025-03-01')
    doc = httpx.get(f'{api}/documents/DOC-T-PLAIN-TERMS', headers=H).json()
    assert doc['front_matter']['title'] == 'Zorbex vendor terms'
    assert 'invoices are paid within 30 days' in doc['body']
