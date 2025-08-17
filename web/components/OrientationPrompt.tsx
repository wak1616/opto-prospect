'use client';

import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';

const OrientationPrompt = () => {
  const [isPortrait, setIsPortrait] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      const isPortraitMode = window.innerHeight > window.innerWidth;
      const isMobileDevice = window.innerWidth <= 1024; // Mobile breakpoint updated for modern devices
      
      setIsPortrait(isPortraitMode);
      setIsMobile(isMobileDevice);
    };

    // Check on mount
    checkOrientation();

    // Listen for orientation changes
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', () => {
      // Small delay to ensure dimensions are updated after orientation change
      setTimeout(checkOrientation, 100);
    });

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // Only show prompt if it's a mobile device in portrait mode
  if (!isMobile || !isPortrait) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-6 text-center max-w-sm mx-auto shadow-2xl">
        <div className="mb-4 flex justify-center">
          <div className="relative">
            <Smartphone size={48} className="text-blue-600 transform rotate-90 animate-pulse" />
            <div className="absolute -top-2 -right-2 text-xl">🔄</div>
          </div>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Better Experience Awaits!
        </h2>
        <p className="text-gray-600 mb-4">
          This app works best in landscape orientation. Please rotate your device for the optimal experience.
        </p>
        <div className="text-sm text-gray-500">
          Turn your phone sideways →
        </div>
      </div>
    </div>
  );
};

export default OrientationPrompt;
