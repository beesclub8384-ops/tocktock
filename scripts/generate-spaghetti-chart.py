"""
세력진입 의심 패턴 스파게티 차트 생성 (matplotlib)
D+1 종가 = 0% 기준, D+2~D+16 시가/고가/저가/종가 등락률

데이터 구조: events[].postExplosion[] (day=1이 D+1 기준점, day=2~16 추적)
"""

import json
import os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import rcParams

# 한글 폰트
for font_name in ['Malgun Gothic', 'NanumGothic', 'AppleGothic', 'sans-serif']:
    try:
        rcParams['font.family'] = font_name
        break
    except:
        continue
rcParams['axes.unicode_minus'] = False

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(SCRIPT_DIR, '..', 'data', 'krx-history', 'institutional-entry-analysis.json')
OUTPUT_PATH = os.path.join(SCRIPT_DIR, '..', 'data', 'krx-history', 'spaghetti-chart.png')

with open(DATA_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)

events = data['events']
stats = data['stats']
n = len(events)

if n == 0:
    print("No events found.")
    exit(1)

days = list(range(2, 17))  # D+2 ~ D+16

COLORS = {
    'open': '#555555',
    'close': '#DC2626',
    'high': '#16A34A',
    'low': '#2563EB',
}
LABELS = {
    'open': '시가',
    'close': '종가',
    'high': '고가',
    'low': '저가',
}

fig, ax = plt.subplots(figsize=(16, 9), facecolor='#0f0f0f')
ax.set_facecolor('#0f0f0f')

# Y축 범위 클램핑 (극단적 아웃라이어 무시, 5~95 백분위수 기반)
all_close_vals = []
for ev in events:
    for d in ev['postExplosion']:
        if 2 <= d['day'] <= 16:
            all_close_vals.extend([d['open'], d['high'], d['low'], d['close']])
all_close_vals.sort()
p5 = all_close_vals[int(len(all_close_vals) * 0.02)]
p95 = all_close_vals[int(len(all_close_vals) * 0.98)]
y_margin = (p95 - p5) * 0.15
Y_MIN = p5 - y_margin
Y_MAX = p95 + y_margin

# 개별 종목 선 (얇고 투명, Y축 클램핑)
for ev in events:
    pe = {d['day']: d for d in ev['postExplosion']}
    for price_type, color in COLORS.items():
        values = []
        valid = True
        for day in days:
            if day not in pe:
                valid = False
                break
            values.append(max(Y_MIN, min(Y_MAX, pe[day][price_type])))
        if valid:
            ax.plot(days, values, color=color, alpha=max(0.02, 5.0 / n), linewidth=0.5)

# 평균선 (굵은 실선)
for price_type, color in COLORS.items():
    mean_values = [s[price_type] for s in stats['mean']]
    ax.plot(days, mean_values, color=color, alpha=0.95, linewidth=2.5,
            label=f'{LABELS[price_type]} 평균', linestyle='-')

# 중앙값선 (굵은 점선)
for price_type, color in COLORS.items():
    median_values = [s[price_type] for s in stats['median']]
    ax.plot(days, median_values, color=color, alpha=0.7, linewidth=2,
            label=f'{LABELS[price_type]} 중앙값', linestyle='--')

# 0% 기준선
ax.axhline(y=0, color='#ffffff', linewidth=0.8, alpha=0.4, linestyle='-')

# 스타일링
ax.set_xlabel('D+1 이후 거래일', color='#aaaaaa', fontsize=12)
ax.set_ylabel('D+1 종가 대비 등락률 (%)', color='#aaaaaa', fontsize=12)
ax.set_title(
    f'세력진입 의심 패턴 후 15거래일 추적 (n={n:,})\n'
    f'기준: D+1 종가 = 0%  |  {data["dateRange"]["start"]}~{data["dateRange"]["end"]}',
    color='#ffffff', fontsize=14, fontweight='bold', pad=15
)

ax.set_xticks(days)
ax.set_xticklabels([f'D+{d}' for d in days], color='#888888', fontsize=9)
ax.tick_params(axis='y', colors='#888888')

ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_color('#333333')
ax.spines['bottom'].set_color('#333333')
ax.set_ylim(Y_MIN, Y_MAX)
ax.grid(axis='y', color='#222222', linewidth=0.5)

legend = ax.legend(
    loc='upper left', fontsize=9, ncol=4,
    framealpha=0.7, facecolor='#1a1a1a', edgecolor='#333333',
    labelcolor='#cccccc'
)

plt.tight_layout()
plt.savefig(OUTPUT_PATH, dpi=150, bbox_inches='tight', facecolor='#0f0f0f')
plt.close()

print(f"Chart saved: {OUTPUT_PATH}")
print(f"Events: {n:,}")
