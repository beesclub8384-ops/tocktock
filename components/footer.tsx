import { Separator } from "@/components/ui/separator";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div>
            <img src="/logo.png" height={80} alt="TockTock" style={{ height: 80 }} />
            <p className="mt-1 text-sm text-muted-foreground">
              실시간 주식 정보 공유 커뮤니티
            </p>
          </div>
        </div>
        <Separator className="my-8" />
        <p className="text-center text-sm text-muted-foreground">
          &copy; 2026 TockTock. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
