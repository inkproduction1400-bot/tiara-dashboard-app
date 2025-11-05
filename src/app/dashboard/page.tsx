'use client';

export default function DashboardHome() {
  const insideIframe =
    typeof window !== 'undefined' && window.self !== window.top;

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Tiara Dashboard</h1>
      <p className="text-sm text-gray-600 mt-2">
        {insideIframe ? '（iframe 内で表示されています）' : '（単体ページとして表示中）'}
      </p>
    </main>
  );
}
