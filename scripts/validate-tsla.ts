import YahooFinance from 'yahoo-finance2';
import * as fs from 'fs';
import * as path from 'path';

async function validateTSLAData() {
  try {
    console.log('TSLA 데이터 검증 시작...\n');

    // CSV 읽기
    const csvPath = path.join(process.cwd(), 'data', 'tsla_data.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    const header = lines[0].split(',');
    
    console.log(`CSV 파일: ${csvPath}`);
    console.log(`총 행 수: ${lines.length - 1} (헤더 제외)\n`);

    // 샘플 날짜 선택 (처음 5, 중간 5, 마지막 5)
    const sampleIndices = [
      ...Array.from({ length: 5 }, (_, i) => i + 1),
      Math.floor((lines.length - 1) / 2),
      Math.floor((lines.length - 1) / 2) + 1,
      Math.floor((lines.length - 1) / 2) + 2,
      lines.length - 4,
      lines.length - 3,
      lines.length - 2,
      lines.length - 1,
    ].filter((v, i, a) => a.indexOf(v) === i && v < lines.length);

    const sampleDates: string[] = [];
    const csvData: { [key: string]: any } = {};

    sampleIndices.forEach(idx => {
      const values = lines[idx].split(',');
      const row: { [key: string]: any } = {};
      header.forEach((col, i) => {
        row[col] = values[i];
      });
      const date = row['Date'];
      sampleDates.push(date);
      csvData[date] = row;
    });

    console.log(`샘플 날짜 ${sampleDates.length}개로 검증 중...\n`);

    // Yahoo Finance에서 다시 받기
    const yahoo = new YahooFinance();
    const quotes = await yahoo.historical('TSLA', {
      period1: sampleDates[0],
      period2: sampleDates[sampleDates.length - 1],
      interval: '1d',
    });

    const yahooData: { [key: string]: any } = {};
    quotes.forEach(q => {
      const dateStr = new Date(q.date).toISOString().split('T')[0];
      yahooData[dateStr] = {
        open: Math.round(q.open as number * 100) / 100,
        high: Math.round(q.high as number * 100) / 100,
        low: Math.round(q.low as number * 100) / 100,
        close: Math.round(q.close as number * 100) / 100,
        volume: Math.round(q.volume as number),
      };
    });

    // 비교
    let matchCount = 0;
    let mismatchCount = 0;
    const mismatches: any[] = [];

    sampleDates.forEach(date => {
      if (!yahooData[date]) {
        console.log(`⚠️  ${date}: Yahoo에 데이터 없음`);
        mismatchCount++;
        return;
      }

      const csv = csvData[date];
      const yahoo = yahooData[date];

      const csvVals = {
        open: parseFloat(csv['Open']),
        high: parseFloat(csv['High']),
        low: parseFloat(csv['Low']),
        close: parseFloat(csv['Close']),
        volume: parseInt(csv['Volume']),
      };

      const match =
        csvVals.open === yahoo.open &&
        csvVals.high === yahoo.high &&
        csvVals.low === yahoo.low &&
        csvVals.close === yahoo.close &&
        csvVals.volume === yahoo.volume;

      if (match) {
        console.log(`✅ ${date}: 완벽 일치`);
        matchCount++;
      } else {
        console.log(`❌ ${date}: 불일치 발견`);
        mismatches.push({ date, csv: csvVals, yahoo });
        mismatchCount++;
      }
    });

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`검증 결과:`);
    console.log(`일치: ${matchCount}/${sampleDates.length}`);
    console.log(`불일치: ${mismatchCount}/${sampleDates.length}`);

    if (mismatches.length > 0) {
      console.log(`\n상세 불일치 사항:`);
      mismatches.forEach(m => {
        console.log(`\n${m.date}:`);
        console.log(`  CSV:   O:${m.csv.open} H:${m.csv.high} L:${m.csv.low} C:${m.csv.close} V:${m.csv.volume}`);
        console.log(`  Yahoo: O:${m.yahoo.open} H:${m.yahoo.high} L:${m.yahoo.low} C:${m.yahoo.close} V:${m.yahoo.volume}`);
      });
    } else {
      console.log(`\n🎉 모든 샘플이 Yahoo Finance와 일치합니다!`);
    }
  } catch (error) {
    console.error('검증 오류:', error);
    process.exit(1);
  }
}

validateTSLAData();
