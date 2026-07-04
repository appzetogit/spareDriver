import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useDriverActiveTripStore from '../../../../store/driver/useDriverActiveTripStore';

/**
 * Driver-side rating screen — disabled; drivers are routed straight to
 * the home dashboard after a trip completes.
 */
const RateCustomerPage = () => {
  const navigate = useNavigate();
  const clear = useDriverActiveTripStore((s) => s.clear);

  useEffect(() => {
    clear();
    navigate('/driver/home', { replace: true });
  }, [clear, navigate]);

  return null;
};

export default RateCustomerPage;
