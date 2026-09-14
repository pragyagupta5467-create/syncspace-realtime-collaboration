import { useState, useEffect } from 'react';
import { checkBackendHealth } from '../services/api';

/**
 * Custom hook to monitor backend API connectivity
 */
export function useBackendStatus() {
  const [status, setStatus] = useState({ state: 'checking', message: 'Connecting to API...' });

  useEffect(() => {
    let isMounted = true;

    async function verify() {
      const data = await checkBackendHealth();
      if (!isMounted) return;

      if (data.status === 'ok') {
        setStatus({ state: 'connected', message: 'Backend Operational (Port 5000)' });
      } else {
        setStatus({ state: 'standby', message: 'Backend on Standby' });
      }
    }

    verify();
    const timer = setInterval(verify, 15000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  return status;
}
