"""Builds one verified, PDF-only demo ZIP per clinical year."""
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT.parent / 'src/stellis/static/maya/years'


def main():
    manifest=json.loads((ROOT/'manifest.json').read_text())
    for year in range(2022,2027):
        items=[item for item in manifest if item['clinical_date'].startswith(str(year))]
        output=ROOT/'demo_packages'/f'maya-{year}.zip';output.parent.mkdir(exist_ok=True)
        with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
            payload={'format':'stellis-maya-year-v1','year':year,'patient_id':'SYN-MAYA-001'}
            files={'demo-package.json':(json.dumps(payload,sort_keys=True)+'\n').encode()}
            files.update({item['filename']:(ROOT/item['path']).read_bytes() for item in items})
            for name,data in files.items():
                info=zipfile.ZipInfo(name,date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
                archive.writestr(info,data)
        DEST.mkdir(exist_ok=True,parents=True);(DEST/output.name).write_bytes(output.read_bytes())

if __name__=='__main__': main()
