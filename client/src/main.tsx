import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AppProviders from './app/providers/AppProviders';
import './styles.css';
import './modern.css';
import './app/modernWelcome.css';
import './modernDialogs.css';
import './modernPreviewTypography.css';
import './modernProjects.css';
import './modernTimestamps.css';
import './dialogMotion.css';
import './motionPreference.css';
import { applyUiAppearance, getStoredUiAppearance } from './shared/uiAppearance';
import { applyReduceMotion, getStoredReduceMotion } from './shared/motionPreference';
import { installDatePickerInteraction } from './shared/ui/datePickerInteraction';

applyUiAppearance(getStoredUiAppearance());
applyReduceMotion(getStoredReduceMotion());
installDatePickerInteraction();

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>
);
