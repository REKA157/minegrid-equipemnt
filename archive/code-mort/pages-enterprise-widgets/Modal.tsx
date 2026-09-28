import React from 'react';
import { X } from 'lucide-react';

export const Modal = ({ title, children, onClose }: { title: string, children: React.ReactNode, onClose: () => void }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 transition-opacity duration-300">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl transform transition-all duration-300 scale-95 hover:scale-100">
            <div className="flex justify-between items-center p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200">
                    <X className="h-5 w-5" />
                </button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto">
                {children}
            </div>
        </div>
    </div>
);
