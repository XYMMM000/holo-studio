import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "映卡 Holo Studio · 3D闪卡制作台",
  description: "让图片拥有光与深度。上传、调节、收藏并分享你的互动3D闪卡。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
