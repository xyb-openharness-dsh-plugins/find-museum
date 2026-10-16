#!/usr/bin/env python3
"""Extract the public 2019 national directory; no invented addresses or coordinates.
Development dependency: PyMuPDF. Original PDF is kept outside the plugin package.
"""
from pathlib import Path
import csv,json,re,hashlib,collections,bisect
import fitz
ROOT=Path(__file__).resolve().parents[1]
SOURCE='https://www.gov.cn/zhengce/zhengceku/2020-05/22/5513734/files/1b6a0d01bf584c20bf17d5801a3e3e6f.pdf'
FIELDS=['museum_id','name','grade','grade_as_of','province','city','district','address','longitude','latitude','coordinate_system','geocode_status','amap_poi_id','county_level_candidate','county_basis','themes','featured_exhibits','official_url','official_intro','wechat_name','wechat_url','wechat_intro','opening_hours','opening_status','status_valid_from','status_valid_to','status_checked_at','reservation_url','source_year','source_url','source_page','city_candidate','city_match_method','ownership','free_admission','enrichment_status']
def main():
 pdf=ROOT/'data/raw/national-museums-2019.pdf';doc=fitz.open(pdf)
 # Province labels are vertically merged and can appear on a later page.
 # Use actual PDF border geometry; forward-filling extracted cells mislabels rows.
 extracted=[];boundaries=set();labels=[]
 for i,page in enumerate(doc):
  for drawing in page.get_drawings():
   for item in drawing['items']:
    if item[0]=='re':
     rect=item[1]
     if rect.height<1 and rect.x0<70 and rect.x1>118:boundaries.add(i*1000+round(rect.y0,1))
  for block in page.get_text('dict')['blocks']:
   for line in block.get('lines',[]):
    for span in line['spans']:
     text=span['text'].strip();box=span['bbox']
     if 68<box[0]<119 and text!='辖市' and text.endswith(('省','市','自治区','兵团')):labels.append((i*1000+box[1],text))
  for table in page.find_tables().tables:
   for index,raw in enumerate(table.extract()):
    if len(raw)==11 and str(raw[0] or '').isdigit():
     cell=table.rows[index].cells[0]
     extracted.append((i+1,i*1000+(cell[1]+cell[3])/2,raw))
 low=min(x[1] for x in extracted);high=max(x[1] for x in extracted)
 cuts=sorted(y for y in boundaries if low<y<high)
 regions={bisect.bisect_right(cuts,y):label for y,label in labels}
 if len(cuts)!=31 or len(regions)!=32:raise ValueError('Province geometry needs review')
 rows=[]
 for page_no,position,raw in extracted:
    number=int(raw[0]);name=(raw[2] or '').replace('\n','').strip()
    province=regions[bisect.bisect_right(cuts,position)]
    if not name:raise ValueError(f'Missing name {number}')
    row=dict.fromkeys(FIELDS,'');row.update(museum_id=f'ncha2019-{number:05d}',name=name,grade=(raw[4] or '').replace('\n',''),grade_as_of='2019',province=province,ownership=raw[3] or '',free_admission=raw[5] or '',source_year='2019',source_url=SOURCE,source_page=page_no,geocode_status='unresolved',opening_status='unknown',enrichment_status='base-only')
    if re.search(r'[^自治]县|自治县|旗',name):row.update(county_level_candidate='true',county_basis='name-inference; not administrative confirmation')
    rows.append(row)
 ids=[int(x['museum_id'].split('-')[-1]) for x in rows]
 if ids!=list(range(1,5536)):raise ValueError(f'Incomplete directory: {len(ids)} rows; duplicates {len(ids)-len(set(ids))}')
 if len(set(x['province'] for x in rows))!=32:raise ValueError('Province boundary extraction needs review')
 # City candidates are explicitly separated from verified city fields.
 admin=ROOT/'data/raw/administrative-pc-code.json'
 if admin.exists():
  provinces=json.loads(admin.read_text());names={p['name']:[c['name'] for c in p.get('children',[])] for p in provinces}
  for row in rows:
   if row['province'] in ['北京市','上海市','天津市','重庆市']:row.update(city_candidate=row['province'],city_match_method='province-is-municipality')
   else:
    candidates=[c for c in names.get(row['province'],[]) if c.removesuffix('市') in row['name']]
    if len(candidates)==1:row.update(city_candidate=candidates[0],city_match_method='name-inference; review required')
 dest=ROOT/'data/processed/museums-national.csv'
 with dest.open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader();w.writerows(rows)
 manifest={'schemaVersion':1,'baseYear':2019,'rows':len(rows),'sourceUrl':SOURCE,'retrievedAt':'2026-10-16','rawSha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'csvSha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'provinces':dict(collections.Counter(x['province'] for x in rows)),'quality':{'verifiedCoordinates':0,'verifiedCity':0,'countyNameCandidates':sum(x['county_level_candidate']=='true' for x in rows)},'limitations':['Historic baseline; not current national completeness','Grade/free admission are as of 2019','No current open/closed status inferred from baseline','Empty means unknown; city_candidate is not a verified location']}
 (ROOT/'data/processed/catalog-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'rows':len(rows),'provinceGroups':len(manifest['provinces']),'csv':str(dest),'quality':manifest['quality']},ensure_ascii=False))
if __name__=='__main__':main()
