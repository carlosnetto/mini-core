import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "" }) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative flex items-center justify-center w-10 h-10 bg-matera-blue rounded-lg shadow-lg overflow-hidden">
        <span className="text-white font-bold text-xl tracking-tighter">MC</span>
        <div className="absolute top-1 right-1 w-2 h-2 bg-matera-orange rounded-full"></div>
      </div>
      <div className="flex flex-col justify-center">
        <span className="text-lg font-bold text-matera-blue leading-none tracking-tight">Mini<span className="text-matera-orange">Core</span></span>
        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">System of Record</span>
      </div>
    </div>
  );
};