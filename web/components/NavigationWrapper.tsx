'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import NavButton from './NavButton';
import AuthClientSlot from '../app/AuthClientSlot';

export default function NavigationWrapper() {
  const pathname = usePathname();
  const isSavedPage = pathname === '/saved';
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Detect mobile screen size
  useEffect(() => {
    setMounted(true);
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      console.log('Mobile detection:', mobile, 'Width:', window.innerWidth); // Debug log
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="absolute z-50 flex items-center gap-2 p-3 rounded-2xl shadow-sm bg-white/90 border border-gray-200 top-3 right-3">
        <div className="animate-pulse bg-gray-200 h-8 w-32 rounded"></div>
        <div className="animate-pulse bg-gray-200 h-8 w-24 rounded"></div>
      </div>
    );
  }
  
  console.log('NavigationWrapper rendering:', { isMobile, isSavedPage, mounted }); // Debug log
  
  return (
    <div 
      className={`fixed flex items-center gap-2 rounded-2xl shadow-lg ${
        isSavedPage 
          ? 'bg-white/80' 
          : 'bg-white/90 border border-gray-200'
      } ${
        isMobile 
          ? 'top-4 right-2 flex-row gap-2 p-2' 
          : 'top-3 right-3 p-3'
      }`}
      style={{ zIndex: 10000 }}
    >
      <NavButton />
      <AuthClientSlot />
    </div>
  );
}
