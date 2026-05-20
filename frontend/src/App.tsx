import { DEMO_ROLES } from './auth/demoAuth';
import AdminAvailabilitySlotsPage from './components/AdminAvailabilitySlotsPage';
import AdminBookingsPage from './components/AdminBookingsPage';
import AdminStaffPage from './components/AdminStaffPage';
import ChatPage from './components/ChatPage';
import CollectorDashboardPage from './components/CollectorDashboardPage';
import ProtectedRoleRoute from './components/ProtectedRoleRoute';
import RoleLayout from './components/RoleLayout';
import RoleLoginPage from './components/RoleLoginPage';
import UserBookingsPlaceholderPage from './components/UserBookingsPlaceholderPage';
import UserDashboardPage from './components/UserDashboardPage';
import UserForgotPasswordPage from './components/UserForgotPasswordPage';
import UserLabResultPage from './components/UserLabResultPage';

export default function App() {
  const { pathname } = window.location;

  if (pathname === '/user/login') {
    return <RoleLoginPage role={DEMO_ROLES.USER} />;
  }

  if (pathname === '/user/register') {
    return <RoleLoginPage role={DEMO_ROLES.USER} mode="register" />;
  }

  if (pathname === '/user/forgot-password') {
    return <UserForgotPasswordPage />;
  }

  if (pathname === '/admin/login') {
    return <RoleLoginPage role={DEMO_ROLES.ADMIN} />;
  }

  if (pathname === '/admin/register') {
    return <RoleLoginPage role={DEMO_ROLES.ADMIN} mode="register" />;
  }

  if (pathname === '/collector/login') {
    return <RoleLoginPage role={DEMO_ROLES.COLLECTOR} />;
  }

  if (pathname === '/collector/register') {
    return <RoleLoginPage role={DEMO_ROLES.COLLECTOR} mode="register" />;
  }

  if (pathname === '/user/dashboard') {
    return (
      <ProtectedRoleRoute expectedRole={DEMO_ROLES.USER}>
        <RoleLayout
          role={DEMO_ROLES.USER}
          title="Lịch của tôi"
          subtitle="Theo dõi lịch xét nghiệm, trạng thái lịch hẹn và quay lại Chatbot khi cần đặt lịch mới."
        >
          <UserDashboardPage />
        </RoleLayout>
      </ProtectedRoleRoute>
    );
  }

  if (pathname === '/user/bookings') {
    return (
      <ProtectedRoleRoute expectedRole={DEMO_ROLES.USER}>
        <RoleLayout
          role={DEMO_ROLES.USER}
          title="Lịch của tôi"
          subtitle="Theo dõi lịch xét nghiệm và trạng thái lịch hẹn của bạn."
        >
          <UserBookingsPlaceholderPage />
        </RoleLayout>
      </ProtectedRoleRoute>
    );
  }

  if (pathname === '/user/lab-results') {
    return (
      <ProtectedRoleRoute expectedRole={DEMO_ROLES.USER}>
        <RoleLayout
          role={DEMO_ROLES.USER}
          title="Phân tích kết quả xét nghiệm"
          subtitle="Tải lên file PDF kết quả xét nghiệm để xem phần đọc chỉ số, so sánh khoảng tham chiếu và giải thích an toàn."
        >
          <UserLabResultPage />
        </RoleLayout>
      </ProtectedRoleRoute>
    );
  }

  if (pathname === '/collector/dashboard') {
    return (
      <ProtectedRoleRoute expectedRole={DEMO_ROLES.COLLECTOR}>
        <RoleLayout
          role={DEMO_ROLES.COLLECTOR}
          title="Lịch lấy mẫu"
          subtitle="Lịch lấy mẫu được giao, ưu tiên hôm nay và các lịch hẹn sắp tới."
        >
          <CollectorDashboardPage />
        </RoleLayout>
      </ProtectedRoleRoute>
    );
  }

  if (pathname === '/admin/bookings') {
    return (
      <ProtectedRoleRoute expectedRole={DEMO_ROLES.ADMIN}>
        <RoleLayout
          role={DEMO_ROLES.ADMIN}
          title="Vận hành lịch hẹn"
          subtitle="Quản lý lịch hẹn, phân công nhân viên lấy mẫu, cập nhật trạng thái và ghi chú vận hành."
        >
          <AdminBookingsPage embedded />
        </RoleLayout>
      </ProtectedRoleRoute>
    );
  }

  if (pathname === '/admin/availability-slots') {
    return (
      <ProtectedRoleRoute expectedRole={DEMO_ROLES.ADMIN}>
        <RoleLayout
          role={DEMO_ROLES.ADMIN}
          title="Khung giờ lấy mẫu"
          subtitle="Mở và quản lý khung giờ lấy mẫu để hệ thống chỉ nhận lịch khi còn sức chứa."
        >
          <AdminAvailabilitySlotsPage />
        </RoleLayout>
      </ProtectedRoleRoute>
    );
  }

  if (pathname === '/admin/staff') {
    return (
      <ProtectedRoleRoute expectedRole={DEMO_ROLES.ADMIN}>
        <RoleLayout
          role={DEMO_ROLES.ADMIN}
          title="Nhân viên lấy mẫu"
          subtitle="Quản lý hồ sơ, trạng thái hoạt động và khối lượng lịch được phân công."
        >
          <AdminStaffPage />
        </RoleLayout>
      </ProtectedRoleRoute>
    );
  }

  return <ChatPage />;
}
