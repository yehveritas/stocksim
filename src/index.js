const TTL=3600000, RETRY=600000;
const memory=new Map(), flights=new Map();
const sources={korea:'https://www.bok.or.kr/portal/singl/baseRate/list.do?menuNo=200656',ecos:'https://ecos.bok.or.kr/',energy:'https://fred.stlouisfed.org/',eia:'https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm',bls:'https://www.bls.gov/developers/',krx:'https://openapi.krx.co.kr/',worldbank:'https://data.worldbank.org/',nyfed:'https://www.newyorkfed.org/markets/reference-rates',fred:'https://fred.stlouisfed.org/'};
const ISO2={"USA":"US","CAN":"CA","MEX":"MX","BRA":"BR","ARG":"AR","CHL":"CL","COL":"CO","GBR":"GB","NOR":"NO","FRA":"FR","DEU":"DE","ITA":"IT","ESP":"ES","NLD":"NL","CHE":"CH","SWE":"SE","DNK":"DK","POL":"PL","UKR":"UA","RUS":"RU","TUR":"TR","SAU":"SA","ARE":"AE","OMN":"OM","QAT":"QA","KWT":"KW","IRN":"IR","IRQ":"IQ","KAZ":"KZ","CHN":"CN","JPN":"JP","KOR":"KR","TWN":"TW","IND":"IN","IDN":"ID","MYS":"MY","SGP":"SG","VNM":"VN","THA":"TH","AUS":"AU","NGA":"NG","DZA":"DZ","AGO":"AO","LBY":"LY","EGY":"EG","ZAF":"ZA","ETH":"ET","KEN":"KE","CIV":"CI","GHA":"GH","ALB":"AL","AUT":"AT","AZE":"AZ","BGD":"BD","BGR":"BG","BHR":"BH","BLR":"BY","BLZ":"BZ","BOL":"BO","BRB":"BB","BRN":"BN","CMR":"CM","COD":"CD","COG":"CG","CUB":"CU","CZE":"CZ","ECU":"EC","GAB":"GA","GEO":"GE","GNQ":"GQ","GRC":"GR","GTM":"GT","GUY":"GY","HRV":"HR","HUN":"HU","ISR":"IL","JOR":"JO","KGZ":"KG","LTU":"LT","MAR":"MA","MMR":"MM","MNG":"MN","NER":"NE","NZL":"NZ","PAK":"PK","PER":"PE","PHL":"PH","PNG":"PG","ROU":"RO","SDN":"SD","SEN":"SN","SRB":"RS","SSD":"SS","SUR":"SR","SVK":"SK","SYR":"SY","TCD":"TD","TJK":"TJ","TKM":"TM","TLS":"TL","TTO":"TT","TUN":"TN","UZB":"UZ","VEN":"VE","YEM":"YE"};
const safeNumber=v=>v!==null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
function fail(code){throw new Error(code);}
async function getJson(url,options={}){const r=await fetch(url,{...options,redirect:'follow',signal:AbortSignal.timeout(18000)});if(!r.ok)fail(r.status===401||r.status===403?'AUTH_REQUIRED':'UPSTREAM_UNAVAILABLE');return r.json();}
async function getText(url,options={}){const r=await fetch(url,{...options,redirect:'follow',signal:AbortSignal.timeout(18000)});if(!r.ok)fail(r.status===401||r.status===403?'AUTH_REQUIRED':'UPSTREAM_UNAVAILABLE');return r.text();}
function key(env,name){const v=env[name]?.trim();if(!v)fail('KEY_MISSING');return v;}
function item(id,name,value,unit,period,source,extra={}){return {id,name,value:safeNumber(value),unit:unit||'',period,source,...extra};}
async function ecos(env){const d=await getJson('https://ecos.bok.or.kr/api/KeyStatisticList/'+encodeURIComponent(key(env,'ECOS_API_KEY'))+'/json/kr/1/100/');const rows=d.KeyStatisticList?.row;if(!Array.isArray(rows))fail('AUTH_OR_DATA_ERROR');return {items:rows.map(r=>item(r.KEYSTAT_NAME,r.KEYSTAT_NAME,r.DATA_VALUE,r.UNIT_NAME,r.CYCLE,sources.ecos)).filter(r=>r.value!==null)};}
async function eia(env){const params=new URLSearchParams({'api_key':key(env,'EIA_API_KEY'),'frequency':'daily','data[0]':'value','sort[0][column]':'period','sort[0][direction]':'desc','length':'20'});params.append('facets[series][]','RWTC');params.append('facets[series][]','RBRTE');const d=await getJson('https://api.eia.gov/v2/petroleum/pri/spt/data/?'+params);const rows=d.response?.data;if(!Array.isArray(rows))fail('AUTH_OR_DATA_ERROR');return {items:['RWTC','RBRTE'].map(id=>{const r=rows.find(r=>r.series===id&&safeNumber(r.value)!==null);return r?item(id,id==='RWTC'?'WTI 현물':'Brent 현물',r.value,'USD/배럴',r.period,sources.eia):null;}).filter(Boolean)};}

async function fredLatest(seriesId,name,unit,source=sources.fred){
  const csv=await getText('https://fred.stlouisfed.org/graph/fredgraph.csv?id='+encodeURIComponent(seriesId));
  const lines=csv.trim().split(/\r?\n/).slice(1).reverse();
  const row=lines.map(x=>x.split(',')).find(x=>x.length>=2&&safeNumber(x[1])!==null);
  if(!row)return null;
  return item(seriesId,name,row[1],unit,row[0],source);
}
async function yahooIndex(symbol,name){
  const u='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?range=5d&interval=1d';
  const d=await getJson(u,{headers:{'User-Agent':'Mozilla/5.0 (compatible; 3E-Market/1.0)','Accept':'application/json'}});
  const r=d?.chart?.result?.[0];if(!r)fail('NO_DATA');
  let value=safeNumber(r.meta?.regularMarketPrice),period='';
  if(value===null){
    const closes=r.indicators?.quote?.[0]?.close||[],ts=r.timestamp||[];
    for(let i=closes.length-1;i>=0;i--)if(safeNumber(closes[i])!==null){value=safeNumber(closes[i]);period=ts[i]?new Date(ts[i]*1000).toISOString().slice(0,10):'';break;}
  }else if(r.meta?.regularMarketTime)period=new Date(r.meta.regularMarketTime*1000).toISOString().slice(0,10);
  if(value===null)fail('NO_DATA');
  return item(symbol,name,value,'지수',period||new Date().toISOString().slice(0,10),'https://finance.yahoo.com/');
}
async function markets(){
  const settled=await Promise.allSettled([yahooIndex('^KS11','코스피지수'),yahooIndex('^KQ11','코스닥지수')]);
  const items=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);
  if(!items.length)fail('NO_DATA');
  return {items,note:'공개 시장시세 보조 경로입니다. KRX 공식 API 승인 시 교차검증 경로를 추가합니다.'};
}
async function koreaOfficialCpi(){
  const url='https://mods.go.kr/board.es?act=view&bid=213&list_no=447322&mid=a10301040100';
  const html=await getText(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; 3E-Indicator/1.0)'}});
  const plain=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');
  const m=plain.match(/9월\s*소비자물가지수는[\s\S]{0,180}?전년동월대비\s*([0-9]+(?:\.[0-9]+)?)%/);
  if(!m)fail('NO_DATA');
  return item('KOR_CPI_YOY_OFFICIAL','한국 CPI YoY',m[1],'%','2026-09','https://mods.go.kr/board.es?act=view&bid=213&list_no=447322&mid=a10301040100');
}
async function korea(){
  const out=[];
  try{
    const html=await getText(sources.korea);
    const plain=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');
    const m=plain.match(/(20\d{2})\s*(?:년)?\s*(\d{1,2})월\s*(\d{1,2})일\s*([0-9]+(?:\.[0-9]+)?)/);
    if(m)out.push(item('BOK_BASE_RATE','한국은행 기준금리',m[4],'%',m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0'),sources.korea));
  }catch{}
  try{const cpi=await koreaOfficialCpi();if(cpi)out.push(cpi);}catch{}
  for(const spec of [
    ['DEXKOUS','원/달러 환율(종가)','원/USD'],
    ['IRLTLT01KRM156N','한국 국고채 10년','%'],
    ['LRUNTTTTKRM156S','실업률','%']
  ]){
    try{const r=await fredLatest(spec[0],spec[1],spec[2]);if(r)out.push(r);}catch{}
  }
  if(!out.length)fail('NO_DATA');
  return {items:out,note:'한국은행 공개 기준금리 페이지와 FRED 공개 시계열을 이용한 보조 연결입니다.'};
}
async function energy(){
  const out=[];
  for(const spec of [['DCOILWTICO','WTI 현물','USD/배럴'],['DCOILBRENTEU','Brent 현물','USD/배럴']]){
    try{const r=await fredLatest(spec[0],spec[1],spec[2],sources.energy);if(r)out.push(r);}catch{}
  }
  if(!out.length)fail('NO_DATA');
  return {items:out,note:'EIA 키가 없을 때 FRED가 재배포하는 일별 원유 현물 시계열을 사용합니다.'};
}

async function fredYoY(seriesId,name,source=sources.fred){
  const csv=await getText('https://fred.stlouisfed.org/graph/fredgraph.csv?id='+encodeURIComponent(seriesId));
  const rows=csv.trim().split(/\r?\n/).slice(1).map(x=>x.split(',')).filter(x=>x.length>=2&&safeNumber(x[1])!==null);
  if(rows.length<13)fail('NO_DATA');
  const latest=rows[rows.length-1];
  const latestDate=new Date(latest[0]+'T00:00:00Z');
  const targetYear=latestDate.getUTCFullYear()-1,targetMonth=latestDate.getUTCMonth();
  let prev=null;
  for(let i=rows.length-2;i>=0;i--){
    const d=new Date(rows[i][0]+'T00:00:00Z');
    if(d.getUTCFullYear()===targetYear&&d.getUTCMonth()===targetMonth){prev=rows[i];break;}
  }
  if(!prev)fail('NO_DATA');
  const yoy=(Number(latest[1])/Number(prev[1])-1)*100;
  return item(seriesId,name,yoy,'%',latest[0],source,{index:safeNumber(latest[1])});
}
async function bls(){
  const items=[];
  for(const spec of [
    ['CPIAUCSL','미국 CPI YoY'],
    ['PPIFID','미국 PPI YoY']
  ]){
    try{const r=await fredYoY(spec[0],spec[1]);if(r)items.push(r);}catch{}
  }
  if(!items.length)fail('NO_DATA');
  return {items,note:'BLS 원자료를 FRED가 재배포하는 월별 시계열로 전년동월비를 계산합니다.'};
}
async function worldbank(){
  const specs=[['KOR','NY.GDP.MKTP.KD.ZG','한국 GDP 성장률'],['USA','NY.GDP.MKTP.KD.ZG','미국 GDP 성장률'],['WLD','NY.GDP.MKTP.KD.ZG','세계 GDP 성장률']];
  const out=[];
  for(const [country,indicator,name] of specs){
    const d=await getJson(`https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&per_page=12`);
    const rows=Array.isArray(d)&&Array.isArray(d[1])?d[1]:[];
    const r=rows.find(x=>safeNumber(x.value)!==null);
    if(r)out.push(item(country+'-'+indicator,name,r.value,'%',r.date,sources.worldbank));
  }
  if(!out.length)fail('NO_DATA'); return {items:out};
}
async function nyfed(){
  const d=await getJson('https://markets.newyorkfed.org/api/rates/all/latest.json');
  const rows=Array.isArray(d.refRates)?d.refRates:[];
  const out=[];
  for(const [type,name] of [['EFFR','미국 EFFR'],['SOFR','미국 SOFR']]){
    const r=rows.find(x=>x.type===type&&safeNumber(x.percentRate)!==null);
    if(r)out.push(item(type,name,r.percentRate,'%',r.effectiveDate,sources.nyfed,{volumeInBillions:safeNumber(r.volumeInBillions)}));
  }
  if(!out.length)fail('NO_DATA'); return {items:out};
}
async function fred(){
  const csv=await getText('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10');
  const lines=csv.trim().split(/\r?\n/).slice(1).reverse();
  const row=lines.map(x=>x.split(',')).find(x=>x.length>=2&&safeNumber(x[1])!==null);
  if(!row)fail('NO_DATA');
  return {items:[item('DGS10','미국 국채 10년',row[1],'%',row[0],sources.fred)]};
}
async function krx(env){if(env.KRX_PUBLIC_DISPLAY_APPROVED!=='true')fail('PUBLIC_DISPLAY_NOT_ENABLED');const token=key(env,'KRX_API_KEY');const date=new Date(Date.now()+9*3600000);date.setUTCDate(date.getUTCDate()-1);const day=date.toISOString().slice(0,10).replaceAll('-','');const d=await getJson('https://data-dbg.krx.co.kr/svc/apis/idx/kospi_dd_trd?basDd='+day,{headers:{AUTH_KEY:token}});if(!Array.isArray(d.OutBlock_1))fail('AUTH_OR_DATA_ERROR');return {items:d.OutBlock_1.filter(r=>r.IDX_NM==='코스피').map(r=>item('KOSPI',r.IDX_NM,r.CLSPRC_IDX,'지수',r.BAS_DD,sources.krx)),note:'KRX 통계정보 · 전일 조회. 휴장일에는 자료가 없을 수 있습니다.'};}



const NEWS_CATEGORIES=['주요뉴스','정치','경제','사회','생활·문화','세계','IT·과학'];
const NEWS_QUERIES={
  '전체':{ko:['오늘 주요 뉴스 한국 경제 사회 정치 세계','한국 주요 이슈 기업 시장 정책'],en:['top world news economy politics society technology','global breaking news markets policy society']},
  '주요뉴스':{ko:['오늘 주요 뉴스 한국 경제 사회 정치 세계','한국 주요 이슈 기업 시장 정책'],en:['top world news economy politics society technology','global breaking news markets policy society']},
  '정치':{ko:['정치 국회 정부 대통령 정책 외교 안보'],en:['politics government parliament election diplomacy policy']},
  '경제':{ko:['경제 금융 시장 기업 금리 환율 물가 유가 증시 산업'],en:['economy markets finance business inflation rates oil stocks industry']},
  '사회':{ko:['사회 노동 고용 교육 부동산 인구 복지 사건'],en:['society labor jobs education housing population welfare']},
  '생활·문화':{ko:['생활 문화 소비 여행 유통 식품 건강'],en:['lifestyle culture consumer travel retail food health']},
  '세계':{ko:['세계 국제 미국 중국 일본 유럽 중동 전쟁 외교'],en:['world international US China Japan Europe Middle East geopolitics']},
  'IT·과학':{ko:['IT 과학 AI 반도체 플랫폼 우주 바이오 기술'],en:['technology science AI semiconductor platform space biotech']}
};
function xmlDecode(s=''){return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));}
function stripTags(s=''){return xmlDecode(s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());}
function tagValue(block,tag){const m=block.match(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','i'));return m?xmlDecode(m[1].trim()):'';}
function sourceValue(block){const m=block.match(/<source(?:\s[^>]*)?>([\s\S]*?)<\/source>/i);return m?stripTags(m[1]):'';}
function classifyNews(title,fallback='주요경제지표'){const t=String(title||'').toLowerCase();const rules=[['물가',/(물가|인플레|inflation|cpi|ppi|consumer price|producer price)/],['금리',/(금리|기준금리|국채|채권|연준|fomc|fed |federal reserve|ecb|rate cut|rate hike|bond yield)/],['환율',/(환율|달러|원화|엔화|위안|외환|currency|forex|dollar|yen|yuan|euro)/],['유가',/(유가|원유|wti|brent|opec|crude oil|oil price)/],['식량',/(식량|곡물|밀 |옥수수|대두|쌀 |wheat|corn|soybean|rice|food price|agriculture)/],['자재',/(철강|철광석|구리|알루미늄|원자재|steel|iron ore|copper|aluminum|aluminium|commodity)/],['주요경제지표',/(gdp|성장률|고용|실업|수출|수입|무역|pmi|산업생산|소매판매|economic growth|jobs|employment|unemployment|trade|industrial production|retail sales)/]];for(const [name,re] of rules)if(re.test(t))return name;return fallback==='전체'?'주요경제지표':fallback;}
const OFFICIAL_SOURCE_RE=/(bank of korea|한국은행|federal reserve|연방준비|u\.?s\.? bureau of labor statistics|bls|eia|ecb|european central bank|imf|world bank|oecd|기획재정부|산업통상자원부|통계청|금융위원회|금융감독원)/i;
const HIGH_IMPACT_RE=/(기준금리|금리 인상|금리 인하|fomc|fed |federal reserve|bank of korea|한국은행|cpi|ppi|inflation|인플레|gdp|고용|실업|payroll|환율|원달러|dollar|국제유가|wti|brent|opec|관세|tariff|무역전쟁|recession|침체|금융위기|bank crisis|전쟁|war|제재|sanction)/i;
function impactScore(title,source,publishedAt){let score=45;const t=String(title||'');if(HIGH_IMPACT_RE.test(t))score+=22;if(OFFICIAL_SOURCE_RE.test(source||''))score+=16;if(/(속보|긴급|breaking|unexpected|surprise|record|사상|급등|급락|쇼크|shock)/i.test(t))score+=10;if(/(미국|중국|한국|유럽|일본|global|world|china|korea|euro)/i.test(t))score+=5;const age=(Date.now()-new Date(publishedAt||0).getTime())/36e5;if(Number.isFinite(age)&&age<8)score+=5;return Math.max(1,Math.min(99,score));}
function newsSignals(title,category){const t=String(title||'').toLowerCase();const down=/(하락|둔화|감소|위축|침체|cut|fall|drop|slow|weaker|decline)/.test(t),up=/(상승|증가|확대|강세|인상|rise|surge|increase|stronger|hike)/.test(t);const dir=up&&!down?'상방':down&&!up?'하방':'혼조';const frames={
'물가':{G:'실질 구매력과 소비 여건 확인',I:`물가 압력 ${dir}`,R:'중앙은행 금리 경로 재평가',LC:'실질금리·대출여건 변화 확인',VAP:'채권·성장주·원화 민감도 확대',SF:'인플레이션 기대와 위험선호 확인'},
'금리':{G:'차입비용을 통한 성장 영향',I:'물가 둔화/재가속 판단과 연결',R:`정책금리·시장금리 ${dir}`,LC:'은행 조달비용·신용공급 변화',VAP:'채권가격·주식 할인율·부동산 영향',SF:'금리 기대 변화가 수급에 반영'},
'환율':{G:'수출입·내수 구매력 영향',I:'수입물가 전가 가능성',R:'금리차와 통화정책 기대 확인',LC:'외화조달·달러 유동성 점검',VAP:`원화·수출주·외국인 수급 ${dir}`,SF:'안전자산 선호 여부 확인'},
'유가':{G:'운송·생산비용과 소비 영향',I:`에너지발 물가 압력 ${dir}`,R:'인플레 경로를 통한 금리 영향',LC:'에너지 기업 자금흐름·무역수지 영향',VAP:'정유·항공·화학·운송 업종 차별화',SF:'지정학 위험 프리미엄 확인'},
'식량':{G:'가계 실질소득·신흥국 소비 영향',I:`식품물가 압력 ${dir}`,R:'생활물가 지속성에 따른 정책 영향',LC:'농산물 수입국 외화수요 점검',VAP:'식품·유통·사료 업종 원가 영향',SF:'기상이변·공급차질 기대 확인'},
'자재':{G:'제조업·건설 비용과 투자 영향',I:`생산자물가 압력 ${dir}`,R:'원가 인플레 지속성 확인',LC:'기업 운전자금·재고금융 부담',VAP:'철강·조선·건설·배터리 원가 차별화',SF:'중국 수요와 재고 사이클 확인'},
'주요경제지표':{G:`성장·고용 모멘텀 ${dir}`,I:'임금·수요 측 물가 압력 확인',R:'정책금리 기대 재조정',LC:'신용수요·대출건전성 영향',VAP:'경기민감주·채권·환율 동시 반응',SF:'서프라이즈 방향에 따른 포지셔닝 변화'}};return frames[category]||frames['주요경제지표'];}
function economicTags(text=''){
  const t=String(text||'').toLowerCase(),tags=[];
  const add=x=>{if(!tags.includes(x))tags.push(x);};
  const rules=[
    ['금리',/(금리|기준금리|채권|국채|fomc|fed |연준|ecb|rate|yield)/],
    ['환율',/(환율|달러|원화|엔화|위안|유로|외환|currency|forex|dollar|yen|yuan)/],
    ['물가',/(물가|인플레|cpi|ppi|가격|inflation|consumer price|producer price)/],
    ['고용',/(고용|실업|취업|임금|노동|jobs|employment|unemployment|wage|labor)/],
    ['성장',/(gdp|경제성장|성장률|경기침체|경기\s*(회복|둔화|개선|위축|전망)|침체|소비|투자|growth|recession|consumption|investment)/],
    ['증시',/(증시|주가|코스피|코스닥|나스닥|s&p|stock|equity|shares)/],
    ['산업',/(산업|제조|수출|공급망|반도체|자동차|조선|철강|industry|manufacturing|export|supply chain|semiconductor)/],
    ['에너지',/(유가|원유|wti|brent|opec|가스|전력|energy|oil|gas)/],
    ['부동산',/(부동산|주택|아파트|전세|건설|mortgage|housing|real estate|construction)/],
    ['무역',/(관세|무역|수입|수출|통상|tariff|trade|import|export)/],
    ['재정·정책',/(예산|재정|세금|규제|지원금|budget|fiscal|tax|regulation|subsidy)/],
    ['지정학',/(전쟁|분쟁|제재|외교|안보|중동|우크라이나|대만|war|sanction|geopolit|diplomacy|security)/],
    ['AI·기술',/(ai|인공지능|반도체|데이터센터|클라우드|로봇|우주|artificial intelligence|semiconductor|cloud|robot|space)/],
    ['소비',/(소비|유통|식품|여행|관광|retail|consumer|food|travel|tourism)/]
  ];
  for(const [name,re] of rules)if(re.test(t))add(name);
  return tags.slice(0,6);
}
function industriesFor(title,category){const set=[];const t=String(title||'').toLowerCase();const add=(...x)=>x.forEach(v=>!set.includes(v)&&set.push(v));if(category==='유가')add('정유·에너지','항공·운송','화학');if(category==='환율')add('반도체·IT 수출','자동차','항공·여행');if(category==='금리')add('은행','증권','건설·부동산','성장주');if(category==='물가')add('유통·소비재','채권','내수');if(category==='식량')add('식품','유통','사료·농업');if(category==='자재')add('철강·조선','건설','배터리·전기차');if(category==='주요경제지표')add('경기민감주','은행','수출주');if(/semiconductor|반도체/.test(t))add('반도체');if(/china|중국/.test(t))add('중국 소비·소재');return set.slice(0,4);}
function enrichNews(a){const official=OFFICIAL_SOURCE_RE.test(a.source||'');return {...a,sourceType:official?'공식발표':'언론보도'};}
const TRUSTED_NEWS_SOURCES=[
'Reuters','Bloomberg','CNBC','Financial Times','The Wall Street Journal','Wall Street Journal','Associated Press','AP News','BBC','Nikkei Asia','The Economist','MarketWatch','Barron\'s','Forbes','Fortune','Business Insider','Yahoo Finance','Investing.com',
'연합뉴스','연합뉴스TV','한국경제','한경닷컴','매일경제','서울경제','이데일리','아시아경제','머니투데이','조선비즈','뉴시스','뉴스1','헤럴드경제','파이낸셜뉴스','전자신문','디지털타임스','KBS','MBC','SBS','JTBC','중앙일보','동아일보','조선일보','경향신문','한겨레','한국일보','국민일보','세계일보',
'Federal Reserve','Board of Governors of the Federal Reserve System','European Central Bank','ECB','Bank of Korea','한국은행','U.S. Bureau of Labor Statistics','BLS','U.S. Energy Information Administration','EIA','World Bank','IMF','OECD'
];
function normSourceName(v){return String(v||'').toLowerCase().replace(/&amp;/g,'&').replace(/[^a-z0-9가-힣]+/g,' ').trim();}
const TRUSTED_NEWS_SOURCE_KEYS=new Set(TRUSTED_NEWS_SOURCES.map(normSourceName));
function isTrustedNewsSource(source){const n=normSourceName(source);if(!n)return false;if(TRUSTED_NEWS_SOURCE_KEYS.has(n))return true;for(const k of TRUSTED_NEWS_SOURCE_KEYS){if(n===k||n.startsWith(k+' ')||k.startsWith(n+' '))return true;}return false;}
function safeNewsUrl(raw){try{const u=new URL(String(raw||'').trim());if(u.protocol!=='https:')return '';if(u.username||u.password)return '';return u.href;}catch{return '';}}
const SPAM_NEWS_RE=/(damas de compa(?:ñ|n)[ií]a|sexo(?:\s|$)|desnud[ao]s?|tr[ií]o con|escort(?:s)?|porn(?:o|ografía)?|adult dating|hookup|coger a|viagra|casino bonus|betting bonus)/i;
const LOW_VALUE_ENTERTAINMENT_RE=/(연예|연예인|배우|가수|아이돌|예능|방송인|개그맨|열애|결혼설|이혼|근황|미모|몸매|셀카|인스타|sns|팬미팅|컴백|신곡|콘서트|공항패션|kbo|프로야구|야구|축구|농구|배구|스포츠|홈런|무실점|포효|선발투수|득점|결승골|승부차기|챔피언스리그|프리미어리그)/i;
const ENTERTAINMENT_BUSINESS_RE=/(매출|실적|주가|시가총액|상장|투자|인수|합병|계약|산업|시장|경제|기업|수익|플랫폼|광고|ott|콘텐츠산업|엔터주|지식재산|ip |라이선스|수출|제작비)/i;
function isLowValueEntertainment(title,summary=''){const text=String(title||'')+' '+String(summary||'');return LOW_VALUE_ENTERTAINMENT_RE.test(text)&&!ENTERTAINMENT_BUSINESS_RE.test(text);}
async function newsText(url,headers={}){const r=await fetch(url,{headers,redirect:'follow',signal:AbortSignal.timeout(7000)});if(!r.ok)fail('UPSTREAM_UNAVAILABLE');return r.text();}
function normalizeNewsSummary(raw,title,source,category){
  let x=stripTags(raw||'').replace(/\s+/g,' ').trim();
  const t=String(title||'').replace(/\s+/g,' ').trim();
  const src=String(source||'').trim();
  if(src)x=x.replace(src,'').trim();
  const compact=v=>String(v||'').toLowerCase().replace(/[^a-z0-9가-힣]+/g,'');
  if(!x||x.length<28||compact(x).includes(compact(t))||compact(t).includes(compact(x))){
    const lead={물가:'물가와 가격 흐름에 관한 소식입니다.',금리:'금리와 통화정책 흐름에 관한 소식입니다.',환율:'환율과 외환시장 흐름에 관한 소식입니다.',유가:'국제유가와 에너지시장에 관한 소식입니다.',식량:'식량·농산물 가격과 수급에 관한 소식입니다.',자재:'원자재·산업재 가격과 수급에 관한 소식입니다.',주요경제지표:'성장·고용·무역 등 주요 경제지표에 관한 소식입니다.'}[category]||'주요 경제 흐름에 관한 소식입니다.';
    x=lead+' '+t;
  }
  x=x.replace(/\s+/g,' ').trim();
  if(x.length>260)x=x.slice(0,257).replace(/\s+\S*$/,'')+'…';
  return x;
}
function parseRss(xml,category,region,{trustedOnly=false,forcedSource=''}={}){const blocks=xml.match(/<item\b[\s\S]*?<\/item>/gi)||[];return blocks.map(block=>{let title=stripTags(tagValue(block,'title'));const url=safeNewsUrl(stripTags(tagValue(block,'link')));let source=(forcedSource||sourceValue(block)||((title.match(/ - ([^-]{2,80})$/)||[])[1]||'')).trim();if(source&&title.endsWith(' - '+source))title=title.slice(0,-(' - '+source).length).trim();const rawDate=stripTags(tagValue(block,'pubDate'));const d=new Date(rawDate);const trusted=isTrustedNewsSource(source);if(SPAM_NEWS_RE.test(title))return null;if(trustedOnly&&!trusted)return null;const finalCategory=category==='전체'?'주요뉴스':category;const rawSummary=tagValue(block,'description')||tagValue(block,'summary')||tagValue(block,'content:encoded');const summary=normalizeNewsSummary(rawSummary,title,source,finalCategory);if(isLowValueEntertainment(title,summary))return null;const tags=economicTags(title+' '+summary);return enrichNews({title,summary,url,source,publishedAt:Number.isFinite(d.getTime())?d.toISOString():null,category:finalCategory,tags,region,trustedSource:trusted});}).filter(x=>x&&x.title&&x.url);}
async function googleNewsFeed(query,locale,category,region){const args=locale==='ko'?['ko','KR','KR:ko']:['en-US','US','US:en'];const url='https://news.google.com/rss/search?q='+encodeURIComponent(query+' when:3d')+'&hl='+args[0]+'&gl='+args[1]+'&ceid='+encodeURIComponent(args[2]);const xml=await newsText(url,{'User-Agent':'Mozilla/5.0 (compatible; 3E-News/1.0)'});return parseRss(xml,category,region,{trustedOnly:true});}
async function googleNewsTopicFeed(topic,locale,category,region){
  const args=locale==='ko'?['ko','KR','KR:ko']:['en-US','US','US:en'];
  const path=topic?'https://news.google.com/rss/headlines/section/topic/'+encodeURIComponent(topic):'https://news.google.com/rss';
  const url=path+'?hl='+args[0]+'&gl='+args[1]+'&ceid='+encodeURIComponent(args[2]);
  const xml=await newsText(url,{'User-Agent':'Mozilla/5.0 (compatible; 3E-News/1.0)'});
  return parseRss(xml,category,region,{trustedOnly:true});
}
const DIRECT_KR_NEWS_FEEDS=[
  ['https://www.yna.co.kr/rss/news.xml','연합뉴스'],
  ['https://rss.donga.com/total.xml','동아일보'],
  ['https://www.mk.co.kr/rss/30000001/','매일경제'],
  ['https://www.chosun.com/arc/outboundfeeds/rss/?outputType=xml','조선일보']
];
async function directNewsFeed(url,source,category){
  const xml=await newsText(url,{'User-Agent':'Mozilla/5.0 (compatible; 3E-News/1.0)'});
  return parseRss(xml,category,'KOREA',{trustedOnly:false,forcedSource:source}).map(a=>enrichNews({...a,source,trustedSource:true,tags:economicTags(a.title+' '+(a.summary||''))}));
}
const OFFICIAL_NEWS_FEEDS=[['https://www.federalreserve.gov/feeds/press_all.xml','Federal Reserve','GLOBAL'],['https://www.ecb.europa.eu/rss/press.html','European Central Bank','GLOBAL'],['https://www.ecb.europa.eu/rss/statpress.html','European Central Bank','GLOBAL']];
async function officialNewsFeed(url,source,region='GLOBAL'){const xml=await newsText(url,{'User-Agent':'Mozilla/5.0 (compatible; 3E-News/1.0)'});return parseRss(xml,'경제',region,{trustedOnly:false,forcedSource:source}).map(a=>enrichNews({...a,source,trustedSource:true,category:'경제',tags:economicTags(a.title+' '+(a.summary||''))}));}
function sectionMatch(category,text=''){
  const t=String(text||'').toLowerCase();
  const rules={
    '정치':/(대통령|국회|정부|정당|장관|외교|안보|정책|선거|정치|president|parliament|government|election|diplomacy)/,
    '사회':/(사회|교육|노동|고용|의료|복지|사건|사고|법원|검찰|경찰|학교|labor|education|health|court|police)/,
    '생활·문화':/(문화|생활|여행|관광|음식|유통|패션|공연|영화|방송|스포츠|travel|culture|food|retail|fashion|movie|sports)/,
    '세계':/(미국|중국|일본|유럽|러시아|우크라이나|중동|세계|국제|외신|해외|us |china|japan|europe|russia|ukraine|world|international)/,
    'IT·과학':/(ai|인공지능|반도체|과학|기술|it |플랫폼|로봇|우주|바이오|테크|semiconductor|technology|science|robot|space|biotech)/
  };
  return rules[category]?.test(t)||false;
}
async function broadSectionFallback(category){
  const settled=await Promise.allSettled(DIRECT_KR_NEWS_FEEDS.map(([url,source])=>directNewsFeed(url,source,category)));
  let rows=[];
  for(const r of settled)if(r.status==='fulfilled')rows.push(...r.value);
  return rows.filter(a=>sectionMatch(category,a.title+' '+(a.summary||''))).map(a=>({...a,category,tags:economicTags(a.title+' '+(a.summary||''))}));
}
async function loadNews(category='전체',limit=36){
  if(category!=='전체'&&!NEWS_CATEGORIES.includes(category))fail('BAD_CATEGORY');
  const lim=Math.max(1,Math.min(60,Number(limit)||36)),keyName='news-'+category;
  const cached=await readCache(keyName);
  if(cached&&Date.now()-cached.at<30*60*1000)return {...cached.data,cache:'hit'};
  const section=category==='전체'?'주요뉴스':category;
  let jobs=[];
  if(section==='주요뉴스'){
    jobs=DIRECT_KR_NEWS_FEEDS.map(([url,source])=>directNewsFeed(url,source,'주요뉴스'));
    jobs.push(googleNewsTopicFeed(null,'ko','주요뉴스','KOREA'));
  }else if(section==='정치'||section==='사회'||section==='생활·문화'){
    jobs=DIRECT_KR_NEWS_FEEDS.map(([url,source])=>directNewsFeed(url,source,section));
  }else if(section==='경제'){
    jobs=[
      directNewsFeed('https://www.mk.co.kr/rss/30000001/','매일경제','경제'),
      googleNewsTopicFeed('BUSINESS','ko','경제','KOREA'),
      ...OFFICIAL_NEWS_FEEDS.map(([url,source,region])=>officialNewsFeed(url,source,region))
    ];
  }else if(section==='세계'){
    jobs=[googleNewsTopicFeed('WORLD','ko','세계','KOREA')];
  }else if(section==='IT·과학'){
    jobs=[googleNewsTopicFeed('TECHNOLOGY','ko','IT·과학','KOREA'),googleNewsTopicFeed('SCIENCE','ko','IT·과학','KOREA')];
  }
  const settled=await Promise.allSettled(jobs);
  let rows=[];for(const r of settled)if(r.status==='fulfilled')rows.push(...r.value);
  if(['정치','사회','생활·문화','세계','IT·과학'].includes(section))rows=rows.filter(a=>sectionMatch(section,a.title+' '+(a.summary||'')));
  if(!rows.length&&['정치','사회','생활·문화','세계','IT·과학'].includes(section)){try{rows=await broadSectionFallback(section);}catch{}}
  const seen=new Set();
  rows=rows.filter(a=>!isLowValueEntertainment(a.title,a.summary)).filter(a=>{const k=(a.title||'').toLowerCase().replace(/[^a-z0-9가-힣]+/g,' ').trim();if(!k||seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>new Date(b.publishedAt||0)-new Date(a.publishedAt||0)).slice(0,lim);
  const data={status:rows.length?'ok':'unavailable',category:section,items:rows,fetchedAt:new Date().toISOString(),sources:['검증된 국내 언론 RSS','Google News 공개 RSS','Fed·ECB 공식 RSS'],note:'연예·스포츠성 단순 화제 기사는 제외하고, 기업·시장·산업과 연결되는 콘텐츠만 예외적으로 포함합니다.'};
  if(rows.length)await saveCache(keyName,{at:Date.now(),data});
  return data;
}

function safeAdvisorPayload(body){
 const flow=String(body?.flow||'').slice(0,40),answers=body?.answers&&typeof body.answers==='object'?body.answers:{};
 const clean={};for(const [k,v] of Object.entries(answers).slice(0,30)){const kk=String(k).slice(0,60);if(Array.isArray(v))clean[kk]=v.slice(0,12).map(x=>String(x).slice(0,180));else clean[kk]=String(v).slice(0,500);}return {flow,answers:clean};
}
function extractResponseText(d){if(typeof d?.output_text==='string'&&d.output_text.trim())return d.output_text.trim();for(const item of d?.output||[]){if(item?.type==='message')for(const c of item.content||[])if((c?.type==='output_text'||c?.type==='text')&&typeof c.text==='string'&&c.text.trim())return c.text.trim();}return '';}
async function threeEAdvisor(env,payload){
 const apiKey=env.OPENAI_API_KEY;if(!apiKey)fail('AI_NOT_CONFIGURED');const model=env.OPENAI_MODEL||'gpt-6-luna';
 const instructions=`당신은 한국 은행의 금융상품 탐색을 돕는 '3E 상담원'이다. 사용자가 입력한 정보만 바탕으로 1차 상담을 정리한다. 특정 금융회사나 존재하지 않는 상품명, 금리, 수익률, 세율을 만들어내지 않는다. 현재 단계에서는 상품군과 추가 확인사항만 안내한다. 투자·보험·퇴직연금은 적합성·위험·수수료·세제·중도해지 조건 확인이 필요함을 밝힌다. 기업·무역금융은 거래방향, 국가, 통화, 금액, 결제일, 선적일, Incoterms, 운송, 분할선적·환적, 요구서류, 환리스크, 자금조달 필요성을 실무적으로 연결한다. 보험 상담에서는 사용자가 입력하지 않은 건강·진단 정보를 추정하지 않는다. 답변은 한국어로 짧고 실무적으로 작성한다. 출력 형식은 반드시 [상담 요약] [우선 검토할 상품군/업무] [추천 이유] [추가 확인사항] [주의] 다섯 구역으로 한다.`;
 const input=`상담 분야: ${payload.flow}\n고객 입력: ${JSON.stringify(payload.answers)}`;
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model,instructions,input,max_output_tokens:700})});
 if(!r.ok){const e=await r.text().catch(()=> '');throw new Error(r.status===401||r.status===403?'AI_AUTH_ERROR':'AI_UPSTREAM_'+r.status+':'+e.slice(0,120));}
 const d=await r.json();const text=extractResponseText(d);if(!text)fail('AI_EMPTY');return {text,model,ai:true};
}


const FINLIFE_GROUPS={"020000":"은행","030300":"저축은행"};
const FINLIFE_SERVICES={deposit:'depositProductsSearch',saving:'savingProductsSearch'};
function finlifeNum(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function normalizeFinlife(type,group,baseList,optionList){const byKey=new Map();for(const b of baseList||[]){const key=String(b.fin_co_no||'')+'|'+String(b.fin_prdt_cd||'');if(!b.fin_prdt_cd||!b.fin_co_no)continue;byKey.set(key,{id:key,type,sector:FINLIFE_GROUPS[group]||group,company:b.kor_co_nm||'',companyCode:b.fin_co_no||'',productCode:b.fin_prdt_cd||'',name:b.fin_prdt_nm||'',disclosureMonth:b.dcls_month||'',joinWay:b.join_way||'',maturityInterest:b.mtrt_int||b.mtrt_cnd||'',specialCondition:b.spcl_cnd||'',joinDeny:b.join_deny||'',joinMember:b.join_member||'',maxLimit:finlifeNum(b.max_limit),options:[]});}
 for(const o of optionList||[]){const key=String(o.fin_co_no||'')+'|'+String(o.fin_prdt_cd||'');const p=byKey.get(key);if(!p)continue;const months=finlifeNum(o.save_trm);if(months===null)continue;p.options.push({months,rateType:o.intr_rate_type_nm||'',reserveType:o.rsrv_type_nm||'',rate:finlifeNum(o.intr_rate),maxRate:finlifeNum(o.intr_rate2)});}
 return [...byKey.values()].filter(p=>p.options.length).map(p=>({...p,options:p.options.sort((a,b)=>a.months-b.months)}));}
async function finlifeGroup(type,group,env){const auth=key(env,'FINLIFE_API_KEY');const service=FINLIFE_SERVICES[type];if(!service)fail('BAD_PRODUCT_TYPE');let page=1,maxPage=1,bases=[],opts=[];do{const u=new URL(`https://finlife.fss.or.kr/finlifeapi/${service}.json`);u.searchParams.set('auth',auth);u.searchParams.set('topFinGrpNo',group);u.searchParams.set('pageNo',String(page));const d=await getJson(u.toString());const r=d?.result;if(!r||String(r.err_cd||'000').replace(/^0+$/,'')&&!['000','0000'].includes(String(r.err_cd||'')))throw new Error('FINLIFE_DATA_ERROR');bases.push(...(r.baseList||[]));opts.push(...(r.optionList||[]));maxPage=Math.max(1,Math.min(20,Number(r.max_page_no)||1));page++;}while(page<=maxPage);return normalizeFinlife(type,group,bases,opts);}
async function loadFinancialProducts(types,env){const allowed=[...new Set(types.filter(t=>FINLIFE_SERVICES[t]))];if(!allowed.length)fail('BAD_PRODUCT_TYPE');const cacheKey='finlife-'+allowed.sort().join('-'),cached=await readCache(cacheKey);if(cached&&Date.now()-cached.at<6*60*60*1000)return cached.data;const jobs=[];for(const type of allowed)for(const group of Object.keys(FINLIFE_GROUPS))jobs.push(finlifeGroup(type,group,env));const settled=await Promise.allSettled(jobs);let items=[];for(const x of settled)if(x.status==='fulfilled')items.push(...x.value);if(!items.length)fail(key(env,'FINLIFE_API_KEY')?'FINLIFE_UNAVAILABLE':'KEY_MISSING');const data={status:'ok',items,fetchedAt:new Date().toISOString(),source:'금융감독원 금융상품통합비교공시 Open API',groups:FINLIFE_GROUPS};await saveCache(cacheKey,{at:Date.now(),data});return data;}

const providers={markets,korea,ecos,energy,eia,bls,krx,worldbank,nyfed,fred};
const INCOME_KO={'HIC':'고소득','UMC':'중상위소득','LMC':'중하위소득','LIC':'저소득','INX':'미분류'};
async function countryProfile(code){
  if(!/^[A-Z]{3}$/.test(code))fail('BAD_COUNTRY');
  const d=await getJson(`https://api.worldbank.org/v2/country/${encodeURIComponent(code)}?format=json`);
  const r=Array.isArray(d)&&Array.isArray(d[1])?d[1][0]:null;if(!r)fail('NO_DATA');
  const incomeCode=r.incomeLevel?.id||'INX';
  return {code,name:r.name||code,region:r.region?.value||'',incomeLevel:r.incomeLevel?.value||'',incomeLevelKo:INCOME_KO[incomeCode]||r.incomeLevel?.value||'미분류',capitalCity:r.capitalCity||'',source:sources.worldbank,fetchedAt:new Date().toISOString()};
}
async function loadCountryProfile(code){
  const cacheKey='country-profile-'+code,cached=await readCache(cacheKey);if(cached&&Date.now()-cached.at<TTL*24)return cached.data;
  const data=await countryProfile(code);await saveCache(cacheKey,{at:Date.now(),data});return data;
}
async function readCache(k){if(memory.has(k))return memory.get(k);try{const r=await globalThis.caches?.default?.match('https://3e-cache.internal/v9/'+k);if(r)return await r.json();}catch{}return null;}
async function saveCache(k,data){memory.set(k,data);try{await globalThis.caches?.default?.put('https://3e-cache.internal/v9/'+k,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=604800'}}));}catch{}}
async function loadProvider(name,env){const cached=await readCache(name);if(cached&&Date.now()-cached.at<(cached.status==='ok'?TTL:RETRY))return cached;if(flights.has(name))return flights.get(name);const promise=(async()=>{let result;try{const data=await providers[name](env);if(!data.items.length)fail('NO_DATA');result={provider:name,status:'ok',at:Date.now(),fetchedAt:new Date().toISOString(),...data};}catch(e){const code=['PUBLIC_DISPLAY_NOT_ENABLED','KEY_MISSING','AUTH_REQUIRED','AUTH_OR_DATA_ERROR','NO_DATA'].includes(e.message)?e.message:'UPSTREAM_UNAVAILABLE';result={provider:name,status:cached?.items?.length?'stale':'unavailable',at:Date.now(),fetchedAt:cached?.fetchedAt||null,items:cached?.items||[],error:code};}await saveCache(name,result);return result;})();flights.set(name,promise);try{return await promise;}finally{flights.delete(name);}}
const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
export default {async fetch(request,env={}){const url=new URL(request.url);if(!['GET','HEAD','POST'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD, POST',...headers}});if(request.method==='POST'&&url.pathname!=='/api/3e-advisor')return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD',...headers}});if(url.pathname==='/robots.txt')return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${url.origin}/sitemap.xml\n`,{headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});if(url.pathname==='/sitemap.xml')return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url.origin}/</loc></url></urlset>`,{headers:{...headers,'Content-Type':'application/xml; charset=utf-8'}});if(url.pathname==='/api/health')return new Response(JSON.stringify({status:'ok',version:'v53.4',openaiConfigured:Boolean(env.OPENAI_API_KEY),finlifeConfigured:Boolean(env.FINLIFE_API_KEY),host:url.host}),{headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});if(url.pathname==='/api/3e-advisor'){try{const len=Number(request.headers.get('content-length')||0);if(len>20000)return new Response(JSON.stringify({error:'PAYLOAD_TOO_LARGE'}),{status:413,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});const body=await request.json();const payload=safeAdvisorPayload(body);const result=await threeEAdvisor(env,payload);return new Response(JSON.stringify(result),{headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});}catch(e){const code=e.message||'AI_UNAVAILABLE';const status=code==='AI_NOT_CONFIGURED'?503:(code==='AI_AUTH_ERROR'?502:400);return new Response(JSON.stringify({error:code}),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});}}if(url.pathname==='/api/financial-products'){const types=(url.searchParams.get('types')||'deposit,saving').split(',').map(x=>x.trim()).filter(Boolean);try{const result=await loadFinancialProducts(types,env);return new Response(request.method==='HEAD'?null:JSON.stringify(result),{headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, max-age=21600'}});}catch(e){const code=e.message||'FINLIFE_UNAVAILABLE';return new Response(JSON.stringify({status:'unavailable',items:[],error:code}),{status:code==='KEY_MISSING'?503:502,headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});}}if(url.pathname==='/api/news'){const category=url.searchParams.get('category')||'전체';const limit=url.searchParams.get('limit')||'36';try{const result=await loadNews(category,limit);return new Response(request.method==='HEAD'?null:JSON.stringify(result),{headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=300'}});}catch(e){return new Response(JSON.stringify({status:'unavailable',category,items:[],error:e.message||'NEWS_UNAVAILABLE'}),{status:e.message==='BAD_CATEGORY'?400:502,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});}}if(url.pathname==='/api/country-profile'){const code=(url.searchParams.get('code')||'').toUpperCase();try{const result=await loadCountryProfile(code);return new Response(request.method==='HEAD'?null:JSON.stringify(result),{headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=86400'}});}catch{return new Response(JSON.stringify({error:'PROFILE_UNAVAILABLE'}),{status:404,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});}}if(url.pathname.startsWith('/api/')){const name=url.pathname.slice(5);if(!Object.hasOwn(providers,name))return new Response('Not found',{status:404,headers});const result=await loadProvider(name,env);return new Response(request.method==='HEAD'?null:JSON.stringify(result),{headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});}if(url.pathname==='/'||url.pathname==='/index.html'){if(!env.ASSETS)return new Response('Assets unavailable',{status:503,headers});const target=new URL('/',request.url);const assetRequest=new Request(target.toString(),{method:request.method,headers:request.headers});return env.ASSETS.fetch(assetRequest);}if(env.ASSETS)return env.ASSETS.fetch(request);return new Response('Not found',{status:404,headers});},async scheduled(controller,env={},ctx){const job=Promise.allSettled([...Object.keys(providers).map(name=>loadProvider(name,env)),loadNews('전체',18)]);if(ctx?.waitUntil)ctx.waitUntil(job);else await job;}};