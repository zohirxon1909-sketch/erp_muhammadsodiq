import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function CurrencyBootstrap({ children }: { children: React.ReactNode }) {
  const activeCompanyId = useAuthStore((s) => s.activeCompany?.id);

  useEffect(() => {
    if (activeCompanyId) {
      void useAuthStore.getState().hydrateSession();
    }
  }, [activeCompanyId]);

  return <>{children}</>;
}
