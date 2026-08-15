import * as Dialog from '@radix-ui/react-dialog';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export interface AppConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface AppPromptOptions extends AppConfirmOptions {
  defaultValue?: string;
  inputLabel?: string;
  placeholder?: string;
}

interface ConfirmRequest extends AppConfirmOptions {
  kind: 'confirm';
  resolve: (confirmed: boolean) => void;
}

interface PromptRequest extends AppPromptOptions {
  kind: 'prompt';
  resolve: (value: string | null) => void;
}

type DialogRequest = ConfirmRequest | PromptRequest;

interface AppDialogContextValue {
  confirm: (options: AppConfirmOptions) => Promise<boolean>;
  prompt: (options: AppPromptOptions) => Promise<string | null>;
}

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [inputValue, setInputValue] = useState('');
  const requestRef = useRef<DialogRequest | null>(null);
  const queueRef = useRef<DialogRequest[]>([]);

  const activateRequest = useCallback((nextRequest: DialogRequest | null) => {
    requestRef.current = nextRequest;
    setRequest(nextRequest);
    setInputValue(nextRequest?.kind === 'prompt' ? nextRequest.defaultValue || '' : '');
  }, []);

  const enqueueRequest = useCallback((nextRequest: DialogRequest) => {
    if (requestRef.current) {
      queueRef.current.push(nextRequest);
      return;
    }
    activateRequest(nextRequest);
  }, [activateRequest]);

  const finishRequest = useCallback((result?: boolean | string | null) => {
    const activeRequest = requestRef.current;
    if (!activeRequest) return;

    if (activeRequest.kind === 'confirm') {
      activeRequest.resolve(result === true);
    } else {
      activeRequest.resolve(typeof result === 'string' ? result : null);
    }

    activateRequest(queueRef.current.shift() || null);
  }, [activateRequest]);

  const confirm = useCallback((options: AppConfirmOptions) => new Promise<boolean>((resolve) => {
    enqueueRequest({ ...options, kind: 'confirm', resolve });
  }), [enqueueRequest]);

  const prompt = useCallback((options: AppPromptOptions) => new Promise<string | null>((resolve) => {
    enqueueRequest({ ...options, kind: 'prompt', resolve });
  }), [enqueueRequest]);

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);
  const isPrompt = request?.kind === 'prompt';
  const confirmDisabled = isPrompt && !inputValue.trim();

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <Dialog.Root open={Boolean(request)} onOpenChange={(open) => !open && finishRequest()}>
        <Dialog.Portal>
          <Dialog.Overlay className="app-action-dialog-overlay" />
          <Dialog.Content className="app-action-dialog-card">
            <div className="app-action-dialog-head">
              <Dialog.Title>{request?.title || '请确认'}</Dialog.Title>
              <Dialog.Description>{request?.description || ''}</Dialog.Description>
            </div>
            {isPrompt ? (
              <label className="app-action-dialog-field">
                <span>{request.inputLabel || '名称'}</span>
                <input
                  autoFocus
                  value={inputValue}
                  placeholder={request.placeholder}
                  onChange={(event) => setInputValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing && inputValue.trim()) {
                      event.preventDefault();
                      finishRequest(inputValue.trim());
                    }
                  }}
                />
              </label>
            ) : null}
            <div className="app-action-dialog-actions">
              <button type="button" className="secondary-action" onClick={() => finishRequest()}>
                {request?.cancelLabel || '取消'}
              </button>
              <button
                type="button"
                className={request?.danger ? 'danger-action' : 'primary-action'}
                disabled={confirmDisabled}
                onClick={() => finishRequest(isPrompt ? inputValue.trim() : true)}
              >
                {request?.confirmLabel || '确认'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) {
    throw new Error('useAppDialog 必须在 AppDialogProvider 内使用');
  }
  return context;
}
