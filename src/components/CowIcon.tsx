import React from 'react';

interface CowIconProps {
    size?: number;
    color?: string;
    style?: React.CSSProperties;
    className?: string;
}

export function CowIcon({ size = 20, color = 'currentColor', style, className }: CowIconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={style}
            className={className}
            aria-hidden="true"
        >
            <path d="M4.5 4.5C3 4.5 2 6 2.5 8" />
            <path d="M19.5 4.5C21 4.5 22 6 21.5 8" />
            <path d="M3.5 8.5C2 9 1.5 10.5 2.5 11.5c1.5 0 2.5-.8 3-1.8" />
            <path d="M20.5 8.5C22 9 22.5 10.5 21.5 11.5c-1.5 0-2.5-.8-3-1.8" />
            <path d="M5.5 7.5c1.5-.8 4-1 6.5-1s5 .2 6.5 1c.8 2.5.5 5.5 0 8-.8 1-2.2 1.5-4 1.5h-5c-1.8 0-3.2-.5-4-1.5-.5-2.5-.8-5.5 0-8z" />
            <rect x="7.5" y="14" width="9" height="5.5" rx="2.5" />
            <circle cx="10" cy="16.5" r="0.8" fill={color} />
            <circle cx="14" cy="16.5" r="0.8" fill={color} />
            <circle cx="8.5" cy="11" r="1" fill={color} />
            <circle cx="15.5" cy="11" r="1" fill={color} />
        </svg>
    );
}
