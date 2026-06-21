import * as fs from 'fs';
import * as path from 'path';
function run(){
  // 1) 기준선 + 기간 (tsla_data.csv에서 정확히 계산)
  const dataCsv=fs.readFileSync(path.join(process.cwd(),'data','tsla_data.csv'),'utf-8').split('\n').filter(l=>l.trim());
  const rows=dataCsv.slice(1).map(l=>{const v=l.split(',');return {date:v[0],close:parseFloat(v[4])};});
  const start=60,end=rows.length-1;
  let bo=0,bu=0;
  for(let i=start;i<end;i++){bo++;if(rows[i+1].close>rows[i].close)bu++;}
  const baseRate=Math.round(bu/bo*1000)/10;

  // 2) 후보 (tsla-shortlist.csv 파싱)
  const short=fs.readFileSync(path.join(process.cwd(),'reports','tsla-shortlist.csv'),'utf-8').replace(/^﻿/,'').split('\n').filter(l=>l.trim());
  const candidates:any[]=[];
  for(let i=1;i<short.length;i++){
    const m=short[i].match(/^(\d+),"([^"]*)",([\d.]+),(\d+),(-?[\d.]+),(-?[\d.]+),/);
    if(!m)continue;
    candidates.push({rank:+m[1],condition:m[2],prob:+m[3],occ:+m[4],lift:+m[5],avg:+m[6]});
  }

  const out={
    ticker:'TSLA',
    meta:{
      from:rows[start].date, to:rows[end-1].date, candles:rows.length, baseRate,
      inSample:true, validated:false,
      note:'전체기간 in-sample 확률입니다. 검증 전 조사 후보이며, 미래 예측력을 보장하지 않습니다.',
      verification:'단일 31개·조합 563개를 OOS(전후반 분리)+본페로니 보정으로 검증한 결과, 통과한 패턴은 0개였습니다.'
    },
    // 과적합 시연용: 검색량을 늘릴수록 in-sample 최고 승률이 올라감(신호 아님, 과적합)
    overfitting:[
      {scope:'단일 조건 31개', search:31, maxProb:56.9},
      {scope:'2·3개 조합 563개', search:563, maxProb:77.1},
      {scope:'재료 확장 4,962개', search:4962, maxProb:80.0}
    ],
    candidates
  };
  fs.writeFileSync(path.join(process.cwd(),'data','tsla-patterns.json'),JSON.stringify(out,null,2),'utf-8');
  console.log(`기준선: ${baseRate}% | 후보: ${candidates.length}개 | 과적합 포인트 3개 포함`);
  console.log('저장: data/tsla-patterns.json (검증 맥락 + 차트 데이터 포함)');
}
run();
