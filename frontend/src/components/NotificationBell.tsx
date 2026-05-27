import { useEffect, useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, Loader2, RefreshCw, X, UserRound } from 'lucide-react';
import {
  listAdminNotifications,
  listCollectorNotifications,
  markAdminNotificationRead,
  markCollectorNotificationRead,
  markAllAdminNotificationsRead,
  markAllCollectorNotificationsRead,
  Notification,
} from '../api/notificationApi';

type NotificationBellProps = {
  role: 'ADMIN' | 'COLLECTOR';
};

export default function NotificationBell({ role }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRejection, setSelectedRejection] = useState<Notification | null>(null);
  const [error, setError] = useState('');

  async function loadNotifications() {
    setIsLoading(true);
    setError('');

    try {
      const data =
        role === 'ADMIN'
          ? await listAdminNotifications()
          : await listCollectorNotifications();

      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải thông báo.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMarkRead(notification: Notification) {
    if (notification.readAt) return;

    try {
      if (role === 'ADMIN') {
        await markAdminNotificationRead(notification.id);
      } else {
        await markCollectorNotificationRead(notification.id);
      }

      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  }

  async function handleMarkAllRead() {
    try {
      if (role === 'ADMIN') {
        await markAllAdminNotificationsRead();
      } else {
        await markAllCollectorNotificationsRead();
      }

      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: new Date().toISOString() })),
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  }

  function handleClickNotification(notification: Notification) {
    handleMarkRead(notification);

    if (notification.type === 'ASSIGNMENT_REJECTED') {
      setSelectedRejection(notification);
      setIsOpen(false);
    } else if (notification.type === 'COLLECTOR_TASK_ASSIGNED') {
      const pendingSection = document.getElementById('pending-assignments');
      if (pendingSection) {
        pendingSection.scrollIntoView({ behavior: 'smooth' });
      }
      setIsOpen(false);
    } else if (notification.bookingCode) {
      window.location.href = role === 'ADMIN'
        ? `/admin/bookings?code=${notification.bookingCode}`
        : `/collector/dashboard#assigned`;
      setIsOpen(false);
    }
  }

  function formatRelativeTime(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;

    return date.toLocaleDateString('vi-VN');
  }

  function getNotificationIcon(type: string) {
    switch (type) {
      case 'BOOKING_CREATED':
      case 'COLLECTOR_TASK_ASSIGNED':
        return CheckCircle2;
      case 'ASSIGNMENT_REJECTED':
        return AlertCircle;
      default:
        return Bell;
    }
  }

  useEffect(() => {
    loadNotifications();

    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [role]);

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setIsOpen((current) => !current);
            if (!isOpen) loadNotifications();
          }}
          className={`inline-flex items-center gap-3 rounded-2xl border px-3 py-2 text-left text-sm shadow-sm transition ${
            role === 'COLLECTOR'
              ? 'border-emerald-100 bg-emerald-50/80 hover:border-emerald-200 hover:bg-yellow-50'
              : 'border-sky-100 bg-sky-50/70 hover:border-sky-200 hover:bg-sky-100/70'
          }`}
        >
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm ${
              role === 'COLLECTOR'
                ? 'bg-gradient-to-br from-emerald-400 to-lime-300'
                : 'bg-gradient-to-br from-sky-400 to-teal-400'
            }`}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Bell className="h-5 w-5" />
            )}
          </span>
          {unreadCount > 0 ? (
            <span
              className={`absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white ${
                role === 'COLLECTOR'
                  ? 'bg-rose-500'
                  : 'bg-rose-600'
              }`}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </button>

        {isOpen ? (
          <div
            className={`absolute right-0 top-full z-50 mt-2 w-96 rounded-2xl border bg-white p-3 shadow-2xl ${
              role === 'COLLECTOR'
                ? 'border-emerald-100 shadow-[0_20px_50px_rgba(16,185,129,0.16)]'
                : 'border-sky-100 shadow-[0_20px_50px_rgba(14,165,233,0.16)]'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-semibold text-slate-900">Thông báo</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadNotifications}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                  title="Làm mới"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Đã đọc tất cả
                  </button>
                ) : null}
              </div>
            </div>

            {error ? (
              <div className="py-8 text-center text-sm text-rose-600">{error}</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">Chưa có thông báo nào.</div>
            ) : (
              <div className="mt-2 max-h-80 overflow-y-auto">
                {notifications.map((notification) => {
                  const Icon = getNotificationIcon(notification.type);
                  const isUnread = !notification.readAt;

                  return (
                    <button
                      type="button"
                      key={notification.id}
                      onClick={() => handleClickNotification(notification)}
                      className={`flex w-full gap-3 rounded-xl p-3 text-left transition hover:bg-slate-50 ${
                        isUnread ? 'bg-sky-50/50' : ''
                      }`}
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                          notification.type === 'ASSIGNMENT_REJECTED'
                            ? 'bg-rose-100 text-rose-600'
                            : 'bg-emerald-100 text-emerald-600'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {notification.title}
                          </p>
                          {isUnread ? (
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-500" />
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{notification.message}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {formatRelativeTime(notification.createdAt)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {selectedRejection ? (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
            role === 'COLLECTOR' ? 'bg-emerald-950/30' : 'bg-sky-950/30'
          }`}
        >
          <div
            className={`w-full max-w-lg rounded-2xl border bg-white p-5 shadow-2xl ${
              role === 'COLLECTOR' ? 'border-emerald-100' : 'border-sky-100'
            }`}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Collector từ chối nhiệm vụ</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedRejection.metadata?.bookingCode || selectedRejection.bookingCode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRejection(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Đóng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 rounded-xl bg-slate-50 p-4">
              <div className="text-sm">
                <span className="font-semibold text-slate-700">Collector: </span>
                <span className="text-slate-600">
                  {selectedRejection.metadata?.collectorName ||
                    selectedRejection.assignment?.collector?.fullName ||
                    '-'}
                </span>
              </div>
              <div className="text-sm">
                <span className="font-semibold text-slate-700">Lý do từ chối: </span>
                <span className="text-slate-600">
                  {selectedRejection.metadata?.rejectReason || selectedRejection.assignment?.rejectReason || '-'}
                </span>
              </div>
              {selectedRejection.metadata?.sampleDate ? (
                <div className="text-sm">
                  <span className="font-semibold text-slate-700">Ngày lấy mẫu: </span>
                  <span className="text-slate-600">{selectedRejection.metadata.sampleDate}</span>
                </div>
              ) : null}
              {selectedRejection.metadata?.sampleTimeStart ? (
                <div className="text-sm">
                  <span className="font-semibold text-slate-700">Giờ lấy mẫu: </span>
                  <span className="text-slate-600">{selectedRejection.metadata.sampleTimeStart}</span>
                </div>
              ) : null}
              {selectedRejection.metadata?.address ? (
                <div className="text-sm">
                  <span className="font-semibold text-slate-700">Địa chỉ: </span>
                  <span className="text-slate-600">{selectedRejection.metadata.address}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedRejection(null)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${
                  role === 'COLLECTOR'
                    ? 'bg-emerald-500 hover:bg-emerald-600'
                    : 'bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-600 hover:to-teal-600'
                }`}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
