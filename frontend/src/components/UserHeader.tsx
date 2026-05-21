import { useEffect, useRef, useState } from 'react';
import { LogOut, Pencil, UserRound, X } from 'lucide-react';
import { DemoSession, logoutDemoRole } from '../auth/demoAuth';
import { UserProfileEditForm } from './UserProfileEditPage';

const USER_HEADER_SUBTITLE =
  'Theo dõi lịch xét nghiệm, trạng thái lịch hẹn và quay lại Chatbot khi cần đặt lịch mới.';

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'U';
}

export default function UserHeader({ session }: { session: DemoSession }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
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
            <span className="mt-0.5 block line-clamp-2 max-w-[20rem] text-xs font-medium leading-5 text-slate-500">
              {USER_HEADER_SUBTITLE}
            </span>
          </span>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-teal-100 bg-gradient-to-br from-teal-500 to-sky-500 text-sm font-semibold text-white shadow-sm">
            {displayName ? getInitial(displayName) : <UserRound className="h-5 w-5" />}
          </span>
        </button>

        {isOpen ? (
          <div className="absolute right-0 z-50 mt-3 w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-left shadow-xl">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setIsProfileModalOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-teal-50 hover:text-teal-700"
            >
              <Pencil className="h-4 w-4" />
              Chỉnh sửa thông tin
            </button>
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

      {isProfileModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <button
              type="button"
              onClick={() => setIsProfileModalOpen(false)}
              className="absolute right-4 top-4 z-10 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Đóng form chỉnh sửa thông tin"
            >
              <X className="h-5 w-5" />
            </button>
            <UserProfileEditForm
              onCancel={() => setIsProfileModalOpen(false)}
              onSaved={(profile) => setDisplayName(profile.displayName)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
