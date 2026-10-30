import { createContext, useContext, type ReactNode } from "react";

export type ConsumerPreviewProfile = {
  nickname: string;
  avatar?: string;
};

export type ConsumerPreviewDemoState = {
  active: boolean;
  membershipActive: boolean;
  profile: ConsumerPreviewProfile | null;
};

const inactivePreview: ConsumerPreviewDemoState = {
  active: false,
  membershipActive: false,
  profile: null,
};

const ConsumerPreviewDemoContext = createContext<ConsumerPreviewDemoState>(inactivePreview);

export function ConsumerPreviewDemoProvider({
  value,
  children,
}: {
  value: ConsumerPreviewDemoState;
  children: ReactNode;
}) {
  return <ConsumerPreviewDemoContext.Provider value={value}>{children}</ConsumerPreviewDemoContext.Provider>;
}

export function useConsumerPreviewDemo(): ConsumerPreviewDemoState {
  return useContext(ConsumerPreviewDemoContext);
}
