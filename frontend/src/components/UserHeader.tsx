import { useEffect, useRef, useState } from 'react';
import { LogOut, Pencil, UserRound } from 'lucide-react';
import { DemoSession, logoutDemoRole } from '../auth/demoAuth';

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'U';
}

export default function UserHeader({ session }: { session: DemoSession }) {
  const [isOpen, setIsOpen] = useState(false);
  const [displayName, setDisplayName] = useState(session.displayName || 'Người dùng');
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDisplayName(session.displayName || 'Người dùng');
  }, [session.displayName]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleLogout() {
    logoutDemoRole();
    window.location.href = '/user/login';
  }

  return (
    <>
      <div ref={wrapperRef} className="relative flex justify-end">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="inline-flex max-w-[min(32rem,100%)] items-center justify-end gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-right shadow-sm outline-none ring-offset-2 hover:border-teal-200 hover:bg-teal-50 focus:ring-2 focus:ring-teal-400"
          aria-label="Mở menu tài khoản"
          aria-expanded={isOpen}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-900">{displayName}</span>
          </span>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-teal-100 bg-gradient-to-br from-teal-500 to-sky-500 text-sm font-semibold text-white shadow-sm">
            {displayName ? getInitial(displayName) : <UserRound className="h-5 w-5" />}
          </span>
        </button>

        {isOpen ? (
          <div className="absolute right-0 z-50 mt-3 w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-left shadow-xl">
            <a
              href="/user/profile"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-teal-50 hover:text-teal-700"
            >
              <Pencil className="h-4 w-4" />
              Chỉnh sửa thông tin
            </a>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
            >
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
