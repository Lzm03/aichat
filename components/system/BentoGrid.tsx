import React from 'react';

interface BentoGridProps {
  children: React.ReactNode;
  className?: string;
}

export const BentoGrid: React.FC<BentoGridProps> = ({ children, className = '' }) => {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-4 auto-rows-auto gap-6 ${className}`}>
      {children}
    </div>
  );
};

interface BentoGridItemProps {
  children: React.ReactNode;
  className?: string;
}

export const BentoGridItem: React.FC<BentoGridItemProps> = ({ children, className = '' }) => {
  // Pass through classes like col-span-2, row-span-1, etc.
  return (
    <div className={className}>
      {children}
    </div>
  );
};
