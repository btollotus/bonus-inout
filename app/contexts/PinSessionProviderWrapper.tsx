"use client";

import { PinSessionProvider } from "./PinSessionContext";

export default function PinSessionProviderWrapper({ children }: { children: React.ReactNode }) {
  return <PinSessionProvider>{children}</PinSessionProvider>;
}