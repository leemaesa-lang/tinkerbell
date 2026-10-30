export type ScopedChatState<T> = {
  scope: string;
  value: T;
};

export function isScopedChatStateFor<T>(state: ScopedChatState<T>, scope: string): boolean {
  return state.scope === scope;
}

export function resolveScopedChatState<T>(
  state: ScopedChatState<T>,
  scope: string,
  load: () => T,
): T {
  return isScopedChatStateFor(state, scope) ? state.value : load();
}

export function updateScopedChatState<T>(
  state: ScopedChatState<T>,
  scope: string,
  load: () => T,
  update: (current: T) => T,
): ScopedChatState<T> {
  const current = resolveScopedChatState(state, scope, load);
  return { scope, value: update(current) };
}
