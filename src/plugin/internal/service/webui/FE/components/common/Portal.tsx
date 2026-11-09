import { useEffect, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: ReactNode;
  lockScroll?: boolean;
}

let scrollLocks = 0;
let restoreBodyScroll = () => {};

function lockBodyScroll() {
  if (scrollLocks++ === 0) {
    const { body, documentElement } = document;
    const { overflow, paddingRight } = body.style;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
    const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.overflow = 'hidden';
    // Keep the page's width when its scrollbar disappears.
    if (scrollbarWidth > 0) body.style.paddingRight = `${padding + scrollbarWidth}px`;
    restoreBodyScroll = () => {
      body.style.overflow = overflow;
      body.style.paddingRight = paddingRight;
    };
  }
  // Another dialog may still need the background locked.
  return () => {
    if (--scrollLocks === 0) restoreBodyScroll();
  };
}

const Portal: React.FC<PortalProps> = ({ children, lockScroll = false }) => {
  const elRef = useRef<HTMLDivElement | null>(null);

  if (!elRef.current) {
    elRef.current = document.createElement('div');
  }

  useEffect(() => {
    const portalRoot = document.body;
    const el = elRef.current!;
    portalRoot.appendChild(el);

    return () => {
      portalRoot.removeChild(el);
    };
  }, []);

  useEffect(() => lockScroll ? lockBodyScroll() : undefined, [lockScroll]);

  return createPortal(children, elRef.current);
};

export default Portal;
