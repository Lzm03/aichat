import React from 'react';
import { FloatingSidebar } from '@/components/student/FloatingSidebar';
import { Header } from '@/components/student/Header';

export default function StudentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <FloatingSidebar />
      <div className="flex-1 flex flex-col pl-24 pr-8 py-8">
        <Header />
        <main className="flex-1 mt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
