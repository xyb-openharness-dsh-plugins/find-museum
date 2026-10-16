from pathlib import Path
import csv,json,hashlib
r=Path(__file__).resolve().parents[1];p=r/'data/processed/museums-national.csv';rows=list(csv.DictReader(p.open(encoding='utf-8-sig')));manifest=json.loads((r/'data/processed/catalog-manifest.json').read_text())
assert len(rows)==5535 and len({v['museum_id'] for v in rows})==5535
assert len({v['province'] for v in rows})==32
for name,province in [('山西博物院','山西省'),('南京博物院','江苏省'),('山东博物馆','山东省'),('陕西历史博物馆','陕西省')]:assert next(x for x in rows if x['name']==name)['province']==province
assert all(x['source_year']=='2019' and x['opening_status']=='unknown' for x in rows)
assert hashlib.sha256(p.read_bytes()).hexdigest()==manifest['csvSha256']
venues=json.loads((r/'data/processed/venues-suzhou.json').read_text());assert len(venues)==5
assert all(x['crs']=='GCJ-02' and x['openingStatus']=='unknown' and x['sourceUrl'] for x in venues)
assert len({x['museumId'] for x in venues})==4
print(json.dumps({'catalogRows':len(rows),'uniqueIds':5535,'provinceBoundarySamples':'passed','pilotVenues':5,'pilotInstitutions':4,'statusHonesty':'passed','csvHash':'passed'},ensure_ascii=False))
