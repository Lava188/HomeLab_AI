import ChatPage from './components/ChatPage';
import AdminBookingsPage from './components/AdminBookingsPage';

export default function App() {
  if (window.location.pathname === '/admin/bookings') {
    return <AdminBookingsPage />;
  }

  return <ChatPage />;
}
