import React, { forwardRef, ButtonHTMLAttributes } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { SpinnerSVG } from './Spinner';

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
        light: 'bg-gray-800 text-white border border-gray-800 shadow-sm hover:bg-gray-700 hover:border-gray-700 focus-visible:ring-gray-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
    },
    secondary: {
        dark: 'bg-gray-800/70 text-gray-100 border border-white/10 shadow-inner shadow-black/40 backdrop-blur-md hover:bg-gray-800/55 hover:border-white/20 focus-visible:ring-slate-200/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
        light: 'bg-white text-gray-700 border border-gray-300 shadow-sm hover:bg-gray-50 hover:border-gray-400 focus-visible:ring-gray-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
    },
    ghost: {
        dark: 'text-gray-200 border border-white/0 hover:border-white/15 hover:bg-gray-900/40 backdrop-blur-md focus-visible:ring-slate-200/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
        light: 'text-gray-600 border border-transparent hover:border-gray-200 hover:bg-gray-100 focus-visible:ring-gray-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
    },
    danger: {
        dark: 'bg-red-600/80 text-white border border-red-400/40 shadow-[0_15px_35px_rgba(185,28,28,0.35)] hover:bg-red-600 hover:border-red-300/60 focus-visible:ring-red-300/60 focus-visible:ring-offset-gray-900',
        light: 'bg-red-600 text-white border border-red-600 shadow-sm hover:bg-red-700 hover:border-red-700 focus-visible:ring-red-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
    },
};

const sizeStyles: Record<ButtonSize, string> = {
    xs: 'px-3 py-1.5 text-xs min-h-[30px]',
    sm: 'px-4 py-2 text-sm min-h-[36px]',
    md: 'px-5 py-2.5 text-sm min-h-[44px]',
    lg: 'px-6 py-3 text-base min-h-[48px]',
};

/** Maps button size to appropriate spinner size */
const spinnerSizeMap: Record<ButtonSize, 'xs' | 'sm'> = {
    xs: 'xs',
    sm: 'sm',
    md: 'sm',
    lg: 'sm',
};

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
        const isDark = themeKey === 'dark';

        // Base classes with micro-interactions for "expensive" feel
        // - Smooth hover scale-up for anticipation
        // - Instant active press-down for responsive tactile feedback
        // - Proper focus states with theme-aware ring offset
        const baseClasses = [
            // Layout
            'inline-flex items-center justify-center gap-2',
            // Typography
            'font-medium',
            // Shape
            'rounded-full',
            // Transitions - smooth for hover, none for active (instant press feedback)
            'transition-all duration-200 ease-out',
            'active:transition-none',
            // Micro-interactions - subtle scale transforms
            'hover:scale-[1.02]',
            'active:scale-[0.98]',
            // Focus states - accessible and theme-aware
            'focus:outline-none',
            'focus-visible:ring-2',
            'focus-visible:ring-offset-2',
            isDark ? 'focus-visible:ring-offset-gray-900' : 'focus-visible:ring-offset-white',
            // Disabled states - no interactions when disabled
            'disabled:opacity-50',
            'disabled:pointer-events-none',
            'disabled:scale-100',
            'disabled:hover:scale-100',
        ].join(' ');

        const widthClass = fullWidth ? 'w-full' : '';

        // Loading state classes - prevent interactions and fade content
        const loadingClasses = loading ? 'cursor-wait' : '';

        const composedClassName = [
            baseClasses,
            variantStyles[variant][themeKey],
            sizeStyles[size],
            widthClass,
            loadingClasses,
            className,
        ]
            .filter(Boolean)
            .join(' ');

        const isDisabled = disabled || loading;

        return (
            <button
                ref={ref}
                className={composedClassName}
                disabled={isDisabled}
                aria-disabled={isDisabled}
                aria-busy={loading}
                data-variant={variant}
                data-loading={loading || undefined}
                data-murp-button="true"
                type={type}
                {...props}
            >
                {loading ? (
                    <>
                        <SpinnerSVG size={spinnerSizeMap[size]} className="shrink-0" label="Processing" />
                        <span className="opacity-70">{children}</span>
                        <span className="sr-only">Processing...</span>
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

export { Button };
export default Button;