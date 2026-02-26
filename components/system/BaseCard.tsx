import React from 'react';

interface BaseCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const BaseCard: React.FC<BaseCardProps> = ({ children, className = '', onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white p-6 rounded-3xl shadow-soft-tech transition-all duration-300 ${onClick ? 'cursor-pointer hover:-translate-y-1 hover:shadow-lg' : ''} ${className}`}
    >
      {children}
    </div>
  );
};
