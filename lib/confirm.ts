'use client';
// Styled confirmation dialog — replaces window.confirm() everywhere
// in the app. The native confirm dialog is ugly on iOS Safari PWA
// (it shows the page domain) and we want consistent button styling
// for destructive vs. neutral actions.
//
// Usage from anywhere in the app:
//
//   import { confirm } from '@/lib/confirm';
//   if (!(await confirm({ title: 'Delete this task?', destructive: true }))) return;
//
// A single <ConfirmDialogHost /> mounts once in AppShell and listens
// to a tiny zustand store for open/close state.

import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmState {
  opts: ConfirmOptions | null;
  resolver: ((value: boolean) => void) | null;
  ask: (opts: ConfirmOptions) => Promise<boolean>;
  resolve: (value: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  opts: null,
  resolver: null,
  ask: (opts) =>
    new Promise<boolean>((resolve) => {
      // If a previous prompt is still open, auto-cancel it so we don't
      // strand its caller.
      const prev = get().resolver;
      if (prev) prev(false);
      set({ opts, resolver: resolve });
    }),
  resolve: (value) => {
    const r = get().resolver;
    set({ opts: null, resolver: null });
    if (r) r(value);
  },
}));

export const confirm = (opts: ConfirmOptions) =>
  useConfirmStore.getState().ask(opts);
