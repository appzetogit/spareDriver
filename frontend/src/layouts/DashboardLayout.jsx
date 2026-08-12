import { Outlet } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import { Home, MapPin, User, Car, DollarSign } from 'lucide-react';
import BookingOfferModal from '../features/driver/trips/components/BookingOfferModal';
import { UserNotificationBridge, DriverNotificationBridge } from '../components/notifications/NotificationBridge';
import { DriverOfferResumeBridge } from '../components/DriverOfferResumeBridge';
import useDriverIncomingScheduledStore from '../store/driver/useDriverIncomingScheduledStore';

const userNavItems = [
  { path: '/user/home', label: 'Home', icon: Home },
  { path: '/user/book', label: 'Book', icon: MapPin, matchPaths: ['/user/book'] },
  // URL stays `/user/activity` (deep links + bookmarks) — the surface
  // label + icon mirror the driver-side "Trips" tab so the user mental
  // model matches.
  { path: '/user/activity', label: 'Trips', icon: Car },
  { path: '/user/account', label: 'Account', icon: User },
];

export const UserDashboardLayout = () => {
  return (
    <div className="flex-1 flex flex-col pb-16">
      <UserNotificationBridge />
      <Outlet />
      <BottomNav items={userNavItems} />
    </div>
  );
};

export const DriverDashboardLayout = () => {
  const incomingCount = useDriverIncomingScheduledStore((s) => s.count);
  const driverNavItems = [
    { path: '/driver/home', label: 'Home', icon: Home },
    { path: '/driver/trips', label: 'Trips', icon: Car, badge: incomingCount },
    { path: '/driver/earnings', label: 'Earnings', icon: DollarSign },
    { path: '/driver/account', label: 'Account', icon: User },
  ];

  return (
    <div className="flex-1 flex flex-col pb-16">
      <DriverNotificationBridge />
      <DriverOfferResumeBridge />
      <Outlet />
      <BottomNav items={driverNavItems} />
      <BookingOfferModal />
    </div>
  );
};
