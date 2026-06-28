import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, Utensils, X } from 'lucide-react';
import Sidebar, { SidebarContent } from './Sidebar';

export default function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-gray-50 md:h-screen md:overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 md:hidden">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-blue-600 p-1.5 text-white">
              <Utensils size={18} />
            </div>
            <span className="text-lg font-bold text-gray-900">Rezzy</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
            aria-label="Open navigation"
          >
            <Menu size={22} />
          </button>
        </header>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
            />
            <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl">
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="absolute right-3 top-3 rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Close navigation"
              >
                <X size={20} />
              </button>
              <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
