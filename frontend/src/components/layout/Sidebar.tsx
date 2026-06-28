import { NavLink, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  LayoutGrid,
  Clock,
  Settings,
  Utensils,
  CalendarClock,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/useAuth';

const nav = [
  { to: '/reservations', label: 'Reservations', icon: CalendarDays },
  { to: '/tables', label: 'Tables', icon: LayoutGrid },
  { to: '/hours', label: 'Hours', icon: Clock },
  { to: '/special-hours', label: 'Special Hours', icon: CalendarClock },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const adminNav = [
  { to: '/admin/users', label: 'User Approval', icon: ShieldCheck },
];

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
};

function NavItems({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <>
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )
          }
        >
          <Icon size={18} className="shrink-0" />
          <span className="truncate">{label}</span>
        </NavLink>
      ))}
    </>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { username, role, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    onNavigate?.();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-6 py-5">
        <div className="rounded-lg bg-blue-600 p-1.5 text-white">
          <Utensils size={18} />
        </div>
        <span className="text-lg font-bold text-gray-900">Rezzy</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        <NavItems items={nav} onNavigate={onNavigate} />
        {role === 'admin' && (
          <div className="mt-3 flex flex-col gap-1 border-t border-gray-100 pt-3">
            <NavItems items={adminNav} onNavigate={onNavigate} />
          </div>
        )}
      </nav>
      <div className="border-t border-gray-100 px-3 py-4">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-700">{username}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="rounded p-2 text-gray-400 transition-colors hover:text-red-500"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

export default function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
      <SidebarContent />
    </aside>
  );
}
