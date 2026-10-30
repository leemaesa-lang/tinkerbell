import { createContext, useContext, type ReactNode } from "react";

type ConsumerAccountAccess = {
  isAuthenticated: boolean;
  requestAuthentication: () => void;
};

const ConsumerAccountAccessContext = createContext<ConsumerAccountAccess>({
  isAuthenticated: false,
  requestAuthentication: () => undefined,
});

export function ConsumerAccountAccessProvider({
  value,
  children,
}: {
  value: ConsumerAccountAccess;
  children: ReactNode;
}) {
  return (
    <ConsumerAccountAccessContext.Provider value={value}>
      {children}
    </ConsumerAccountAccessContext.Provider>
  );
}

export function useConsumerAccountAccess() {
  return useContext(ConsumerAccountAccessContext);
}
