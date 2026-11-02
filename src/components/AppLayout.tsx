import { BookHeart, CalendarDays, Flame, Settings, ShoppingBasket, Warehouse, WifiOff } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useOnline } from '../state/hooks';
import { Logo } from './brand';
import { cx } from './ui';

const TABS = [
  { to: '/', label: 'Discover', icon: Flame, end: true },
  { to: '/cookbook', label: 'Cookbook', icon: BookHeart },
  { to: '/plan', label: 'Plan', icon: CalendarDays },
  { to: '/shop', label: 'Shop', icon: ShoppingBasket },
  { to: '/pantry', label: 'Pantry', icon: Warehouse },
];

export function AppHeader() {
  const online = useOnline();
  return (
    <header className="safe-t sticky top-0 z-30 bg-bg/90 px-4 pb-1 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between">
        <Link to="/" aria-label="Love Bites home"><Logo eager className="h-10 w-auto text-2xl" /></Link>
        <div className="flex items-center gap-2">
          {!online && <span className="flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white"><WifiOff size={14} aria-hidden /> Offline</span>}
          <Link to="/settings" aria-label="Settings" className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[var(--shadow-card)]"><Settings size={20} aria-hidden /></Link>
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  return (
    <nav aria-label="Main" className="safe-b fixed inset-x-0 bottom-0 z-40 px-3 pt-2 md:bottom-3 md:px-0">
      <ul className="mx-auto flex max-w-md items-stretch justify-between rounded-full bg-ink p-1.5 shadow-[var(--shadow-pop)]">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink to={to} end={end} className={({ isActive }) => cx('flex h-12 flex-col items-center justify-center rounded-full text-[11px] font-bold transition', isActive ? 'bg-pop text-ink' : 'text-white')}>
              <Icon size={19} aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function AppLayout() {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 pb-32 pt-1"><Outlet /></main>
      <BottomNav />
    </div>
  );
}
