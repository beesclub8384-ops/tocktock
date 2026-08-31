"use client";

export interface ActionSheetItem {
  label: string;
  onSelect: () => void;
  /** 파괴적인 동작. 빨간 글씨로 구분한다 */
  destructive?: boolean;
}

/** 화면 아래에서 올라오는 동작 목록. 배경을 누르면 닫힌다 */
export function ActionSheet({
  open,
  items,
  onClose,
}: {
  open: boolean;
  items: ActionSheetItem[];
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />

      <div
        className="relative w-full"
        style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto w-full max-w-2xl px-3">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {items.map((item, i) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  onClose();
                  item.onSelect();
                }}
                className={`flex h-[52px] w-full items-center justify-center text-[16px] transition-colors active:bg-border/40 ${
                  i > 0 ? "border-t border-border" : ""
                } ${item.destructive ? "text-red-500" : "text-foreground"}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-2 h-[52px] w-full rounded-2xl border border-border bg-card text-[16px] font-medium text-foreground transition-colors active:bg-border/40"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
