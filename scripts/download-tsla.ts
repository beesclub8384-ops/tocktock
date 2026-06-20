import YahooFinance from 'yahoo-finance2';
import * as fs from 'fs';
import * as path from 'path';

interface OHLCVData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma5: number | null;
  sma10: number | null;
  sma20: number | null;
  sma60: number | null;
}

async function downloadTSLAData() {
  try {
    console.log('테슬라(TSLA) 5년 일봉 데이터 다운로드 중...\n');

    const yahoo = new YahooFinance();
    const endDate = new Date();
    const startDate = new Date(endDate.getFullYear() - 5, endDate.getMonth(), endDate.getDate());

    const quotes = await yahoo.historical('TSLA', {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    });

    if (!quotes || quotes.length === 0) {
      throw new Error('Yahoo Finance에서 데이터를 받을 수 없습니다.');
    }

    console.log(`✅ 데이터 수신 완료: ${quotes.length}개 캔들`);

    const calculateSMA = (data: number[], period: number): number | null => {
      if (data.length < period) return null;
      const sum = data.slice(-period).reduce((a, b) => a + b, 0);
      return sum / period;
    };

    console.log('SMA 지표 계산 중 (5, 10, 20, 60일)...');
    const closes = quotes.map(q => q.close as number);
    const processedData: OHLCVData[] = quotes.map((quote, index) => {
      const closesUpToIndex = closes.slice(0, index + 1);
      return {
        date: new Date(quote.date).toISOString().split('T')[0],
        open: Math.round(quote.open as number * 100) / 100,
        high: Math.round(quote.high as number * 100) / 100,
        low: Math.round(quote.low as number * 100) / 100,
        close: Math.round(quote.close as number * 100) / 100,
        volume: Math.round(quote.volume as number),
        sma5: calculateSMA(closesUpToIndex, 5) ? Math.round(calculateSMA(closesUpToIndex, 5)! * 100) / 100 : null,
        sma10: calculateSMA(closesUpToIndex, 10) ? Math.round(calculateSMA(closesUpToIndex, 10)! * 100) / 100 : null,
        sma20: calculateSMA(closesUpToIndex, 20) ? Math.round(calculateSMA(closesUpToIndex, 20)! * 100) / 100 : null,
        sma60: calculateSMA(closesUpToIndex, 60) ? Math.round(calculateSMA(closesUpToIndex, 60)! * 100) / 100 : null,
      };
    });

    const csvHeader = 'Date,Open,High,Low,Close,Volume,SMA_5,SMA_10,SMA_20,SMA_60\n';
    const csvRows = processedData
      .map(row => `${row.date},${row.open},${row.high},${row.low},${row.close},${row.volume},${row.sma5 ?? ''},${row.sma10 ?? ''},${row.sma20 ?? ''},${row.sma60 ?? ''}`)
      .join('\n');

    const csvContent = csvHeader + csvRows;

    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const outputPath = path.join(dataDir, 'tsla_data.csv');
    fs.writeFileSync(outputPath, csvContent, 'utf-8');

    console.log(`\n✅ 완료!`);
    console.log(`파일 저장: ${outputPath}`);
    console.log(`데이터 행 수: ${processedData.length}`);
    console.log(`날짜 범위: ${processedData[0].date} ~ ${processedData[processedData.length - 1].date}`);
    console.log(`\n마지막 5줄:`);
    console.log(csvHeader + processedData.slice(-5).map(row => `${row.date},${row.open},${row.high},${row.low},${row.close},${row.volume},${row.sma5},${row.sma10},${row.sma20},${row.sma60}`).join('\n'));
  } catch (error) {
    console.error('오류:', error);
    process.exit(1);
  }
}

downloadTSLAData();
