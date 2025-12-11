import React, { forwardRef, ButtonHTMLAttributes } from 'react';
import { useTheme } from '@/components/ThemeProvider';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    fullWidth?: boolean;
    loading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
}

type ThemeVariant = 'light' | 'dark';

const variantStyles: Record<ButtonVariant, Record<ThemeVariant, string>> = {
    primary: {
        dark: 'bg-gray-900/85 text-white border border-white/10 shadow-[0_20px_45px_rgba(0,0,0,0.45)] backdrop-blur-lg hover:bg-gray-900/70 hover:border-white/20 hover:shadow-[0_25px_55px_rgba(0,0,0,0.55)] focus-visible:ring-slate-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
        light: 'bg-gradient-to-br from-[#f5efe5] via-[#e8dfd0] to-[#d4c7b0] text-[#3d3024] border border-[#c9bcaa] shadow-[0_15px_35px_rgba(80,70,60,0.2)] hover:from-[#ede4d5] hover:to-[#c9bca5] hover:shadow-[0_18px_40px_rgba(80,70,60,0.25)] focus-visible:ring-[#d4c7b0]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
    },
    secondary: {
        dark: 'bg-gray-800/70 text-gray-100 border border-white/10 shadow-inner shadow-black/40 backdrop-blur-md hover:bg-gray-800/55 hover:border-white/20 focus-visible:ring-slate-200/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
        light: 'bg-[#f1ddc1]/40 text-[#2b1a10] border border-[#d4b185]/70 shadow-inner shadow-[rgba(43,26,16,0.15)_inset_0_0_15px] hover:bg-[#f3e4cf]/70 hover:border-[#cda572] focus-visible:ring-[#e4c08f]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
    },
    ghost: {
        dark: 'text-gray-200 border border-white/0 hover:border-white/15 hover:bg-gray-900/40 backdrop-blur-md focus-visible:ring-slate-200/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
        light: 'text-[#b5824d] border border-transparent hover:border-[#d4b185]/60 hover:bg-[#f6e5ce]/30 backdrop-blur-md focus-visible:ring-[#e4c08f]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
    },
    danger: {
        dark: 'bg-red-600/80 text-white border border-red-400/40 shadow-[0_15px_35px_rgba(185,28,28,0.35)] hover:bg-red-600 hover:border-red-300/60 focus-visible:ring-red-300/60 focus-visible:ring-offset-gray-900',
        light: 'bg-red-600 text-white border border-red-400/30 shadow-[0_18px_40px_rgba(185,28,28,0.25)] hover:bg-red-500 focus-visible:ring-red-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
    },
};

const sizeStyles: Record<ButtonSize, string> = {
    xs: 'px-3 py-1.5 text-xs min-h-[30px]',
    sm: 'px-4 py-2 text-sm min-h-[36px]',
    md: 'px-5 py-2.5 text-sm min-h-[44px]',
    lg: 'px-6 py-3 text-base min-h-[48px]',
};

const Spinner = () => (
    <svg
        className="h-4 w-4 animate-spin opacity-80"
        viewBox="0 0 24 24"
        aria-hidden="true"
    >
        <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
        />
        <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
    </svg>
);

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            className = '',
            variant = 'primary',
            size = 'md',
            fullWidth = false,
            loading = false,
            disabled,
            leftIcon,
            rightIcon,
            children,
            type = 'button',
            ...props
        },
        ref,
    ) => {
        const { resolvedTheme } = useTheme();
        const themeKey: ThemeVariant = resolvedTheme === 'light' ? 'light' : 'dark';
        const baseClasses =
            'inline-flex items-center justify-center gap-2 font-medium rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]';
        const widthClass = fullWidth ? 'w-full' : '';
        const composedClassName = [
            baseClasses,
            variantStyles[variant][themeKey],
            sizeStyles[size],
            widthClass,
            className,
        ]
            .filter(Boolean)
            .join(' ');

        return (
            <button
                ref={ref}
                className={composedClassName}
                disabled={disabled || loading}
                data-variant={variant}
                data-murp-button="true"
                type={type}
                {...props}
            >
                {loading ? (
                    <>
                        <Spinner />
                        <span className="sr-only">Processing…</span>
                    </>
                ) : (
                    <>
                        {leftIcon}
                        {children}
                        {rightIcon}
                    </>
                )}
            </button>
        );
    },
);

Button.displayName = 'Button';

export default Button;