import React from 'react';

type ButtonVariant = 'primary' | 'success' | 'danger' | 'ghost';
type ButtonStyle = 'normal' | 'tactile';

interface BaseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: ButtonVariant;
  buttonStyle?: ButtonStyle;
  className?: string;
  icon?: React.ElementType;
}

export const BaseButton: React.FC<BaseButtonProps> = ({
  children,
  variant = 'primary',
  buttonStyle = 'normal',
  className = '',
  icon: Icon,
  ...props
}) => {
  const baseClasses = 'px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200 focus:ring-4 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed';

  // Using JIT-safe class names with brand colors defined in config
  const variantClasses = {
    primary: 'bg-brand-primary text-white hover:bg-indigo-700 focus:ring-indigo-200',
    success: 'bg-brand-success text-white hover:bg-emerald-700 focus:ring-emerald-200',
    danger: 'bg-brand-danger text-white hover:bg-rose-700 focus:ring-rose-200',
    ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
  };
  
  const styleClasses = {
    normal: '',
    tactile: 'shadow-md hover:shadow-lg active:shadow-sm active:translate-y-0.5',
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${styleClasses[buttonStyle]} ${className}`}
      {...props}
    >
      {Icon && <Icon className="w-4 h-4" />}
      <span>{children}</span>
    </button>
  );
};
