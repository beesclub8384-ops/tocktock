import type { Metadata } from "next";
import Link from "next/link";

/**
 * 유튜브 자막 도구 소개 (2026-11-27)
 * 아저씨 스튜디오(Your Korean Uncle 채널)의 자막 자동 등록 도구가 구글 OAuth 앱을 '게시'하려면
 * 실제로 열리는 홈페이지 주소가 필요해서 TockTock 안에 둔 페이지. 메뉴에는 넣지 않는다.
 * 개인정보처리방침 링크(/youtube-captions/privacy)가 이 페이지에 있어야 한다 (구글 요구 사항).
 */
export const metadata: Metadata = {
  title: "Your Korean Uncle Caption Uploader",
  description: "A personal tool that uploads subtitle files to videos on the Your Korean Uncle YouTube channel.",
  robots: { index: false, follow: false },
};

export default function YoutubeCaptionsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 leading-relaxed">
      <h1 className="mb-6 text-2xl font-bold">Your Korean Uncle Caption Uploader</h1>
      <p className="mb-4">
        This is a personal tool used only by the owner of the YouTube channel &quot;Your Korean Uncle&quot;.
        After the owner uploads an animated episode to YouTube, the tool attaches English and Korean subtitle
        files (SRT) to that video.
      </p>
      <p className="mb-4">
        It uses the YouTube Data API only to upload captions to videos on the owner&apos;s own channel.
        It does not upload, edit or delete videos, and it is not offered to other users.
      </p>
      <p className="mb-10">
        <Link href="/youtube-captions/privacy" className="underline">Privacy Policy</Link>
      </p>

      <hr className="mb-10" />

      <h2 className="mb-4 text-xl font-bold">Your Korean Uncle 자막 올리기 도구</h2>
      <p className="mb-4">
        유튜브 채널 &quot;Your Korean Uncle&quot; 주인 한 사람만 쓰는 개인용 도구입니다.
        채널 주인이 애니메이션 영상을 유튜브에 올리면, 이 도구가 그 영상에 영어·한글 자막 파일(SRT)을 붙입니다.
      </p>
      <p className="mb-4">
        YouTube Data API는 채널 주인 본인 영상에 자막을 올리는 데만 씁니다.
        영상을 올리거나 고치거나 지우지 않고, 다른 사람에게 제공하지 않습니다.
      </p>
      <p>
        <Link href="/youtube-captions/privacy" className="underline">개인정보처리방침</Link>
      </p>
    </div>
  );
}
