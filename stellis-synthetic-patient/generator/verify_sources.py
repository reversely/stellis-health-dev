"""Refresh direct PDF downloads and compare with recorded research hashes."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import requests

ROOT=Path(__file__).resolve().parents[1]

def verify(row):
    try:
        response=requests.get(row['direct_pdf_url'],timeout=90)
        response.raise_for_status()
        assert response.content.startswith(b'%PDF')
        actual=hashlib.sha256(response.content).hexdigest()
        return dict(reference_id=row['reference_id'],url=row['direct_pdf_url'],verified=True,sha256=actual,matches_research=actual==row['sha256'])
    except Exception as exc:
        return dict(reference_id=row['reference_id'],url=row['direct_pdf_url'],verified=False,error=str(exc))

if __name__=='__main__':
    references=json.loads((ROOT/'research/reference_catalog.json').read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        results=list(executor.map(verify,references))
    (ROOT/'validation/source_verification.json').write_text(json.dumps(results,indent=2)+'\n')
    print(json.dumps(dict(verified=sum(r['verified'] for r in results),total=len(results),changed=[r['reference_id'] for r in results if r.get('matches_research') is False])))
    if not all(r['verified'] and r['matches_research'] for r in results):raise SystemExit(1)
