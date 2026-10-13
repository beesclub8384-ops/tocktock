// 투자자 이름 줄이기 + 한국어 조사 붙이기

import { cleanText } from "./format";

// " - " 앞부분(사람 이름) 기준. 표에 없으면 영문 그대로 쓴다.
const KO_NAMES: Record<string, string> = {
  "Warren Buffett": "버핏",
  "Bill Ackman": "애크먼",
  "Mohnish Pabrai": "파브라이",
  "Li Lu": "리 루",
  "David Tepper": "테퍼",
  "Seth Klarman": "클라먼",
  "Howard Marks": "마크스",
  "Michael Burry": "버리",
  "Chris Hohn": "혼",
  "Terry Smith": "스미스",
  "Daniel Loeb": "러브",
  "Bruce Berkowitz": "버코위츠",
  "Guy Spier": "스피어",
  "Pat Dorsey": "도시",
  "Lee Ainslie": "에인슬리",
  "David Rolfe": "롤프",
  "Dennis Hong": "홍",
  "Robert Vinall": "비날",
  "Nelson Peltz": "펠츠",
  "Stephen Mandel": "맨델",
  "Clifford Sosin": "소신",
  "Duan Yongping": "듀안 용핑",
  "Christopher Bloomstran": "블룸스트란",
  "Yacktman Asset Management": "약트먼",
};

/** "Warren Buffett - Berkshire Hathaway" → "버핏", "AltaRock Partners" → 그대로 */
export function shortName(full: string): string {
  const person = personPart(full);
  return KO_NAMES[person] ?? person;
}

/** " - " 앞부분 (표 매칭용) */
export function personPart(full: string): string {
  return cleanText(full).split(" - ")[0].trim();
}

// 영문 알파벳을 한국어로 읽을 때 받침이 있는 글자 (엘·엠·엔·알)
const EN_BATCHIM = new Set(["L", "M", "N", "R"]);
// 숫자를 읽을 때 받침이 있는 것 (영·일·삼·육·칠·팔·십)
const DIGIT_BATCHIM = new Set(["0", "1", "3", "6", "7", "8"]);

function hasBatchim(word: string): boolean | null {
  const last = word.trim().slice(-1);
  if (!last) return null;
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  // 영문은 티커 같은 대문자 약어일 때만 알파벳 이름(엘·엠·엔·알)으로 읽는다.
  // "Gayner" 같은 일반 단어는 발음을 알 수 없으니 "은(는)" 으로 둔다.
  if (/[A-Za-z]/.test(last)) {
    const letters = word.replace(/[^A-Za-z]/g, "");
    return letters === letters.toUpperCase() ? EN_BATCHIM.has(last.toUpperCase()) : null;
  }
  if (/[0-9]/.test(last)) return DIGIT_BATCHIM.has(last);
  return null;
}

/** josa("버핏", "은", "는") → "버핏은". 판단이 안 되면 "은(는)" */
export function josa(word: string, withBatchim: string, without: string): string {
  const b = hasBatchim(word);
  if (b === null) return `${word}${withBatchim}(${without})`;
  return `${word}${b ? withBatchim : without}`;
}
