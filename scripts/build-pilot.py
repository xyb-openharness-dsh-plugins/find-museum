#!/usr/bin/env python3
from pathlib import Path
import json,csv,hashlib
r=Path(__file__).resolve().parents[1]
rows=list(csv.DictReader((r/'data/processed/museums-national.csv').open(encoding='utf-8-sig')))
raw=json.loads((r/'data/raw/amap-suzhou-2026-10-16.json').read_text())
metadata={
'B020001285':dict(museumId='ncha2019-01429',label='城市大馆',district='姑苏区',themes=['江南文化','古代艺术'],intro='以苏州历史、文化和艺术为主要内容的地方综合类博物馆。',officialUrl='https://www.szmuseum.com/',introSource='https://zhuanti.mct.gov.cn/szbwg2022.html',featuredExhibits='秘色瓷莲花碗（馆藏；是否在展待复核）',exhibitSource='https://file.szmuseum.com/WaterMark/门户网站多媒体文件/20190315094115G0Qc0o.pdf',county=False),
'B0FFJWJ0NG':dict(museumId='ncha2019-01429',label='城市新馆',district='虎丘区',themes=['江南文化','古代艺术'],intro='',officialUrl='https://www.szmuseum.com/',introSource='',featuredExhibits='',county=False),
'B0FFMDQXZK':dict(museumId='researched-wu-culture',label='特色专题',district='吴中区',themes=['吴地考古','江南文化'],intro='从吴地历史与考古发现认识江南，馆方网站提供展览与参观信息。',officialUrl='https://app.wuzhongmuseum.com/portal',introSource='https://app.wuzhongmuseum.com/portal',featuredExhibits='',county=False),
'B020001MZW':dict(museumId='ncha2019-01452',label='县域发现',district='常熟市',themes=['地方历史','古代艺术'],intro='可作为苏州周边的人文参观候选，开放时段需按出行日期复核。',officialUrl='https://www.changshu.gov.cn/zgcs/ajjq/202509/45f966effaf643a480bc3d34c6c26d5f.shtml',introSource='https://www.changshu.gov.cn/zgcs/ajjq/202509/45f966effaf643a480bc3d34c6c26d5f.shtml',featuredExhibits='',county=True),
'B02000IVF5':dict(museumId='researched-ancient-brick',label='县域发现',district='昆山市',themes=['砖瓦工艺','地方历史'],intro='锦溪古镇的专题馆，适合关注古代建筑构件与地方工艺的观众。地址与馆名存在历史表述差异，出发前需复核。',officialUrl='https://dfzb.suzhou.gov.cn/dfzb/szdq/201606/6483c2ee7cbd40a5824faffbf21d8742.shtml',introSource='https://dfzb.suzhou.gov.cn/dfzb/szdq/201606/6483c2ee7cbd40a5824faffbf21d8742.shtml',featuredExhibits='瓦当、滴水、建筑砖等类别（具体在展待复核）',county=True)
}
venues=[]
for rec in raw:
 d=rec['data'];m=metadata[rec['poiId']];lng,lat=map(float,d['location'].split(','));base=next((x for x in rows if x['museum_id']==m['museumId']),{})
 venues.append(dict(id='amap-'+rec['poiId'],poiId=rec['poiId'],name=d['name'],city='苏州市',province='江苏省',address='江苏省苏州市'+d['address'],longitude=lng,latitude=lat,crs='GCJ-02',geocodeStatus='poi-matched',openingHours=d.get('opentime2',''),openingStatus='unknown',checkedAt=rec['checkedAt'],sourceUrl='https://uri.amap.com/marker?position='+d['location']+'&name='+d['name'],grade=base.get('grade',''),gradeAsOf=base.get('grade_as_of',''),wechatName='',wechatUrl='',wechatIntro='',visitMinutes=240,durationBasis='4小时基本参观；6–8小时深度参观，可在规划中选择，不是馆方承诺',statusNote='已有常规时间，未核实出行当日临时公告',**m))
(r/'data/processed/venues-suzhou.json').write_text(json.dumps(venues,ensure_ascii=False,indent=2)+'\n')
# Also provide a CSV with the requested fields for researched venues.
fields=list(rows[0].keys());out=[]
for v in venues:
 x=dict.fromkeys(fields,'');x.update(museum_id=v['museumId'],name=v['name'],grade=v['grade'],grade_as_of=v['gradeAsOf'],province=v['province'],city=v['city'],district=v['district'],address=v['address'],longitude=v['longitude'],latitude=v['latitude'],coordinate_system=v['crs'],geocode_status=v['geocodeStatus'],amap_poi_id=v['poiId'],county_level_candidate=str(v['county']).lower(),county_basis='pilot city context; administrative verification pending',themes='|'.join(v['themes']),featured_exhibits=v['featuredExhibits'],official_url=v['officialUrl'],official_intro=v['intro'],opening_hours=v['openingHours'],opening_status='unknown',status_checked_at=v['checkedAt'],source_year=2019 if v['grade'] else '',source_url=v['sourceUrl'],enrichment_status='pilot-poi-and-sourced-notes');out.append(x)
with (r/'data/processed/venues-suzhou.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(out)
slim=[{k:x[k] for k in ['museum_id','name','grade','grade_as_of','province','city_candidate','county_level_candidate']} for x in rows]
payload={'catalog':slim,'venues':venues,'manifest':json.loads((r/'data/processed/catalog-manifest.json').read_text())}
(r/'design/catalog.js').write_text('window.MUSEUM_DATA='+json.dumps(payload,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')+';\n')
print(json.dumps({'nationalRows':len(rows),'pilotVenues':len(venues),'uniquePilotMuseums':len(set(x['museumId'] for x in venues)),'note':'Pilot venue records are not appended as new national institutions'},ensure_ascii=False))
