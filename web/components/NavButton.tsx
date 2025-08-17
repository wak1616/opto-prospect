'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function NavButton() {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Detect mobile screen size
  useEffect(() => {
    setMounted(true);
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      console.log('NavButton Mobile detection:', mobile, 'Width:', window.innerWidth); // Debug log
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="animate-pulse bg-gray-200 h-8 w-24 rounded"></div>
    );
  }
  
  console.log('NavButton rendering:', { pathname, isMobile, mounted }); // Debug log
  
  if (pathname === '/saved') {
    return (
      <Link 
        href="/" 
        className={`border-2 border-green-500 rounded-lg hover:bg-green-50 font-bold bg-white shadow-sm transition-all duration-200 hover:shadow-md ${
          isMobile ? 'px-4 py-2 text-base' : 'px-3 py-2'
        }`}
      >
        {isMobile ? 'Map' : 'Back To Map'}
      </Link>
    );
  }
  
  return (
    <Link 
      href="/saved" 
      className={`border-2 border-green-500 rounded-lg hover:bg-green-50 font-bold bg-white shadow-sm transition-all duration-200 hover:shadow-md ${
        isMobile ? 'px-4 py-2 text-base' : 'px-3 py-2'
      }`}
    >
      {isMobile ? 'View Saved' : 'View Saved Locations'}
    </Link>
  );
}
