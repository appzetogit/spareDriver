import { Outlet } from 'react-router-dom';
import { UserBookingAlertsBridge } from '../components/UserBookingAlertsBridge';

const MobileLayout = () => {
  return (
    <div className="w-full max-w-lg min-h-dvh bg-bg flex flex-col relative">
      <UserBookingAlertsBridge />
      <Outlet />
    </div>
  );
};

export default MobileLayout;
