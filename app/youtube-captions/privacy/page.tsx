import type { Metadata } from "next";
import Link from "next/link";

/**
 * 유튜브 자막 도구 개인정보처리방침 (2026-11-27)
 * 구글 OAuth 앱 게시에 필요한 개인정보처리방침 주소. 내용은 아저씨 스튜디오
 * 시나리오_코드/youtube_captions.py 가 실제로 하는 일과 맞아야 한다:
 * 권한 youtube.force-ssl, 자막(captions) 올리기·옛 자막 바꾸기만, 열쇠는 사무실 PC(C:\ajussi\열쇠)에만.
 */
export const metadata: Metadata = {
  title: "Privacy Policy — Your Korean Uncle Caption Uploader",
  robots: { index: false, follow: false },
};

const CONTACT = "beesclub8384@gmail.com";

export default function YoutubeCaptionsPrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 leading-relaxed">
      <h1 className="mb-2 text-2xl font-bold">Privacy Policy</h1>
      <p className="mb-8 text-sm opacity-70">Your Korean Uncle Caption Uploader · Last updated: November 27, 2026</p>

      <h2 className="mb-2 font-bold">What this app accesses</h2>
      <p className="mb-6">
        The app asks for the YouTube permission &quot;Manage your YouTube account&quot;
        (https://www.googleapis.com/auth/youtube.force-ssl). It uses this permission only to list and upload
        caption tracks on videos of the owner&apos;s own channel, to replace an older caption track in the same language,
        and to read the channel name once at sign-in to confirm the right account.
      </p>

      <h2 className="mb-2 font-bold">How data is used and stored</h2>
      <p className="mb-6">
        The app is used by one person, the channel owner. The sign-in token is stored only on the owner&apos;s own
        computer. No Google user data is collected on a server, sold, shared with third parties, or used for advertising.
      </p>

      <h2 className="mb-2 font-bold">How to remove access</h2>
      <p className="mb-6">
        Access can be removed at any time at{" "}
        <a href="https://myaccount.google.com/permissions" className="underline">myaccount.google.com/permissions</a>.
      </p>

      <h2 className="mb-2 font-bold">Contact</h2>
      <p className="mb-10">{CONTACT}</p>

      <hr className="mb-10" />

      <h2 className="mb-4 text-xl font-bold">개인정보처리방침</h2>
      <p className="mb-4">
        이 도구는 유튜브 권한(youtube.force-ssl)을 채널 주인 본인 영상의 자막을 확인하고 올리는 데만 씁니다.
        같은 언어의 옛 자막이 있으면 새 자막으로 바꾸고, 로그인할 때 맞는 계정인지 채널 이름을 한 번 확인합니다.
      </p>
      <p className="mb-4">
        쓰는 사람은 채널 주인 한 명입니다. 로그인 정보는 채널 주인의 컴퓨터에만 저장합니다.
        구글 사용자 정보를 서버에 모으거나, 팔거나, 다른 사람에게 넘기거나, 광고에 쓰지 않습니다.
      </p>
      <p className="mb-4">
        권한은 언제든{" "}
        <a href="https://myaccount.google.com/permissions" className="underline">myaccount.google.com/permissions</a>
        에서 끊을 수 있습니다.
      </p>
      <p className="mb-10">문의: {CONTACT}</p>

      <p>
        <Link href="/youtube-captions" className="underline">← Home</Link>
      </p>
    </div>
  );
}
