import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const TopbarContractContext = createContext<HTMLDivElement | null>(null);

/** The page retains ownership of its contract and renders its control in the shell. */
export function TopbarContractSlot({ children }: { children: ReactNode }) {
  const target = useContext(TopbarContractContext);
  return target ? createPortal(children, target) : null;
}
