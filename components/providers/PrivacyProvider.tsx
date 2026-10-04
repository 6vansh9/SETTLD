"use client";

import { createContext, useContext, useState } from "react";

interface PrivacyContextValue {
  blurred: boolean;
  setBlurred: (blurred: boolean) => void;
  toggle: () => void;
}

const PrivacyContext = createContext<PrivacyContextValue>({
  blurred: false,
  setBlurred: () => {},
  toggle: () => {},
});

/** Global privacy blur: when on, every <Amount /> is blurred (tap to peek). */
export function PrivacyProvider({
  children,
  defaultBlurred = false,
}: {
  children: React.ReactNode;
  defaultBlurred?: boolean;
}) {
  const [blurred, setBlurred] = useState(defaultBlurred);
  return (
    <PrivacyContext.Provider value={{ blurred, setBlurred, toggle: () => setBlurred((b) => !b) }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
