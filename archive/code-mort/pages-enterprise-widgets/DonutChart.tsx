import React from 'react';

export const DonutChart = ({ completed, pending }: { completed: number, pending: number }) => {
    const total = completed + pending;
    if (total === 0) return null;
    const completedPercentage = (completed / total) * 100;
    const strokeDasharray = `${completedPercentage} ${100 - completedPercentage}`;

    return (
        <div className="relative w-24 h-24 mx-auto my-2">
            <svg viewBox="0 0 36 36" className="w-full h-full">
                <circle cx="18" cy="18" r="15.915" className="stroke-current text-gray-200" strokeWidth="2" fill="transparent" />
                <circle cx="18" cy="18" r="15.915" className="stroke-current text-orange-600" strokeWidth="2" fill="transparent"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset="25"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-gray-900">{total}</span>
                <span className="text-xs text-gray-500">Total</span>
            </div>
        </div>
    );
}
