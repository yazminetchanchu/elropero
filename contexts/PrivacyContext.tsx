import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface PrivacyContextType {
  hideFinancials: boolean;
  togglePrivacy: () => void;
  setHideFinancials: (value: boolean | ((prev: boolean) => boolean)) => void;
  formatSensitive: (value: string | number, mask?: string) => string;
}

const STORAGE_KEY = 'el_ropero_hide_financials';

const defaultContext: PrivacyContextType = {
  hideFinancials: false,
  togglePrivacy: () => { },
  setHideFinancials: () => { },
  formatSensitive: (val) => (typeof val === 'number' ? `$ ${val.toLocaleString()}` : String(val)),
};

const PrivacyContext = createContext<PrivacyContextType>(defaultContext);

export const PrivacyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hideFinancials, setHideFinancialsState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const setHideFinancials = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setHideFinancialsState(prev => {
      const next = typeof value === 'function' ? value(prev) : value;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch (err) {
        console.warn('Error saving privacy setting to localStorage:', err);
      }
      return next;
    });
  }, []);

  const togglePrivacy = useCallback(() => {
    setHideFinancials(prev => !prev);
  }, [setHideFinancials]);

  const formatSensitive = useCallback((value: string | number, mask: string = '$ ••••••'): string => {
    if (!hideFinancials) {
      return typeof value === 'number' ? `$ ${value.toLocaleString()}` : String(value);
    }
    return mask;
  }, [hideFinancials]);

  return (
    <PrivacyContext.Provider value={{ hideFinancials, togglePrivacy, setHideFinancials, formatSensitive }}>
      {children}
    </PrivacyContext.Provider>
  );
};

export const usePrivacy = (): PrivacyContextType => {
  const context = useContext(PrivacyContext);
  return context || defaultContext;
};

