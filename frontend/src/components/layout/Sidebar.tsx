import { NavLink, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  LayoutGrid,
  Clock,
  Settings,
  Utensils,
  CalendarClock,
  LogOut,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';

const nav = [
  { to: '/reservations', label: 'Reservations', icon: CalendarDays },
  { to: '/tables', label: 'Tables', icon: LayoutGrid },
  { to: '/hours', label: 'Hours', icon: Clock },
  { to: '/special-hours', label: 'Special Hours', icon: CalendarClock },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-2.5">
        <div className="bg-blue-600 text-white rounded-lg p-1.5">
          <Utensils size={18} />
        </div>
        <span className="font-bold text-gray-900 text-lg">Rezzy</span>
      </div>
      <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      {/* Footer: username + logout */}
      <div className="px-3 py-4 border-t border-gray-100">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-700 truncate">{username}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
