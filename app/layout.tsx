import React from 'react';
import '../globals.css';

export const metadata = {
  title: 'SmartEdu HK',
  description: 'The unified portal for teachers, students, and administrators.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans bg-slate-50 text-slate-800">
        {children}
      </body>
    </html>
  );
}
