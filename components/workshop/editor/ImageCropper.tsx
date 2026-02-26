import React, { useState } from 'react';
import { Icons } from '../../icons';

interface ImageCropperProps {
    imageUrl: string;
    onApply: (imageUrl: string) => void;
    onCancel: () => void;
}

const aspectRatios: { [key: string]: number | undefined } = {
    '16:9': 16 / 9,
    '4:3': 4 / 3,
    '1:1': 1,
    '自由': undefined,
};

export const ImageCropper: React.FC<ImageCropperProps> = ({ imageUrl, onApply, onCancel }) => {
    const [zoom, setZoom] = useState(1);
    const [aspect, setAspect] = useState<string>('16:9');
    
    // This is a UI simulation. The actual crop box position/size would be managed here.
    const cropBoxStyle = {
        top: '15%',
        left: '15%',
        width: '70%',
        height: '70%',
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
            <div className="bg-white w-full max-w-4xl rounded-3xl shadow-lg flex flex-col h-[85vh]">
                 <div className="flex justify-between items-center p-4 border-b border-slate-200">
                    <div className="flex items-center space-x-2">
                        <span className="text-lg font-bold text-[#1E293B]">裁剪背景圖</span>
                        <div className="flex items-center bg-slate-100 p-1 rounded-full">
                           {Object.keys(aspectRatios).map(key => (
                                <button 
                                    key={key}
                                    onClick={() => setAspect(key)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${aspect === key ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
                                >
                                    {key}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button onClick={onCancel} className="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50">取消</button>
                        <button onClick={() => onApply(imageUrl)} className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700">應用</button>
                    </div>
                </div>

                <div className="flex-1 bg-slate-100 p-4 flex items-center justify-center overflow-hidden relative">
                    <div className="relative w-full h-full flex items-center justify-center">
                        <img 
                            src={imageUrl} 
                            className="max-w-full max-h-full transition-transform duration-150"
                            style={{ transform: `scale(${zoom})` }}
                            draggable={false}
                        />
                        <div className="absolute inset-0 cursor-move" style={{
                            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                            ...cropBoxStyle
                        }}>
                             <div className="w-full h-full border-2 border-white pointer-events-none">
                                <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white rounded-full cursor-nwse-resize border-2 border-slate-100"></div>
                                <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white rounded-full cursor-nesw-resize border-2 border-slate-100"></div>
                                <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white rounded-full cursor-nesw-resize border-2 border-slate-100"></div>
                                <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white rounded-full cursor-nwse-resize border-2 border-slate-100"></div>
                             </div>
                        </div>
                    </div>
                </div>
                
                <div className="p-4 border-t border-slate-200 flex items-center justify-center">
                    <div className="flex items-center space-x-3 w-1/2">
                        <span className="text-sm font-medium text-slate-600 whitespace-nowrap flex-shrink-0">縮放:</span>
                        <input 
                            type="range" 
                            min="1" 
                            max="3" 
                            step="0.01"
                            value={zoom}
                            onChange={(e) => setZoom(parseFloat(e.target.value))}
                            className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" 
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};