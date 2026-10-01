"""J. Reports: GET /reports/compliance?as_of=&format=md|pdf and /reports/audit-prep?date_from=&date_to=&format=."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from .. import reports
from ..contracts import current_user

router = APIRouter(tags=['p2: reports'])


def _send(md: str, fmt: str, name: str) -> Response:
    if fmt == 'pdf':
        return Response(reports.to_pdf(md), media_type='application/pdf',
                        headers={'Content-Disposition': f'attachment; filename="{name}.pdf"'})
    if fmt != 'md':
        raise HTTPException(422, 'format must be md or pdf')
    return Response(md, media_type='text/markdown; charset=utf-8',
                    headers={'Content-Disposition': f'inline; filename="{name}.md"'})


@router.get('/reports/compliance')
async def compliance_report(as_of: date | None = None, format: str = 'md', user: dict = Depends(current_user)):
    d = as_of or date.today()
    return _send(await reports.compliance_report(user, d), format, f'keystone-compliance-{d}')


@router.get('/reports/audit-prep')
async def audit_prep(date_from: date, date_to: date, format: str = 'md', user: dict = Depends(current_user)):
    try:
        md = await reports.audit_prep_report(user, date_from, date_to)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return _send(md, format, f'keystone-audit-prep-{date_from}-{date_to}')
