import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {title:"온하루 · 개인 AI 비서",description:"개인 일정과 생활을 관리하는 AI 비서"};
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="ko"><body>{children}</body></html>;
}
