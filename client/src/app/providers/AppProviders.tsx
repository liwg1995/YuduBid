import type { ReactNode } from 'react';
import { AppDialogProvider, DocumentParseNoticeProvider, ToastProvider } from '../../shared/ui';

interface AppProvidersProps {
  children: ReactNode;
}

function AppProviders({ children }: AppProvidersProps) {
  return (
    <ToastProvider>
      <AppDialogProvider>
        <DocumentParseNoticeProvider>{children}</DocumentParseNoticeProvider>
      </AppDialogProvider>
    </ToastProvider>
  );
}

export default AppProviders;
