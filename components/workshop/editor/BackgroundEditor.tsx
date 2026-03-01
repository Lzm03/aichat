import React, { useState } from 'react';
import { Icons } from '../../icons';
import { ImageCropper } from './ImageCropper';

// FIX: Add 'currentBackground' prop to fix type error from parent component.
interface BackgroundEditorProps {
    onApply: (imageUrl: string) => void;
    onCancel: () => void;
    currentBackground: string;
}

const presetBackgrounds = [
    'https://images.unsplash.com/photo-1580582932707-520aed937b7b?q=80&w=2832&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1518152006812-edab29b069ac?q=80&w=2940&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?q=80&w=2942&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0?q=80&w=2940&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=1600&q=80',
    'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=2940&auto=format&fit=crop',
];

export const mockStyles = {
  "寫實風格":
    "https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=800&q=80",

  "手繪風格":
    "https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?w=400&q=80",

  "卡通風格":
    "https://images.unsplash.com/photo-1606112219348-204d7d8b94ee?w=600&q=80",
};

type Tab = 'templates' | 'upload';
type WorkflowStage = 'select' | 'detect' | 'restyle' | 'cropping';

export const BackgroundEditor: React.FC<BackgroundEditorProps> = ({ onApply, onCancel, currentBackground }) => {
    const [activeTab, setActiveTab] = useState<Tab>('templates');
    const [workflowStage, setWorkflowStage] = useState<WorkflowStage>('select');
    const [uploadedImage, setUploadedImage] = useState<{ url: string; isRealistic: boolean } | null>(null);
    const [imageForCropper, setImageForCropper] = useState<string | null>(null);
    const [selectedStyle, setSelectedStyle] = useState('手繪畫風');
    const [isGenerating, setIsGenerating] = useState(false);
    
    const checkIsRealistic = (file: File): boolean => {
        console.log("Simulating realism check for:", file.name);
        return true; 
    };

    const handleImageSelect = (imageUrl: string) => {
        setImageForCropper(imageUrl);
        setWorkflowStage('cropping');
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            const fileUrl = URL.createObjectURL(file);
            const isRealistic = checkIsRealistic(file);
            setUploadedImage({ url: fileUrl, isRealistic });
            setWorkflowStage('detect');
        }
    };

    const handleGenerate = () => {
        if (!uploadedImage) return;
        setIsGenerating(true);
        setTimeout(() => {
            const generatedImage = 'https://images.unsplash.com/photo-1505028106030-e07ea1bd80c3?q=80&w=2940&auto=format&fit=crop';
            setIsGenerating(false);
            setImageForCropper(generatedImage);
            setWorkflowStage('cropping');
        }, 2500);
    };
    
    const handleCropCancel = () => {
        setImageForCropper(null);
        setWorkflowStage(uploadedImage ? 'detect' : 'select');
    };

    if (workflowStage === 'cropping' && imageForCropper) {
        return <ImageCropper imageUrl={imageForCropper} onApply={onApply} onCancel={handleCropCancel} />;
    }

    const renderUploadContent = () => {
        switch (workflowStage) {
            case 'select':
                return (
                    <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl bg-slate-50 h-full">
                        <Icons.upload className="w-12 h-12 mb-4 text-slate-400" />
                        <p className="font-semibold text-slate-600">拖拽文件到此處</p>
                        <p className="text-sm text-slate-500 mt-1">或</p>
                        <label className="mt-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer">
                            選擇文件
                            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                        </label>
                    </div>
                );
            case 'detect':
            case 'restyle':
                if (!uploadedImage) return null;
                return (
                    <div className="flex flex-col items-center justify-start space-y-4 h-full">
                        <div className="relative w-full h-48 rounded-xl overflow-hidden">
                           <img src={uploadedImage.url} alt="Uploaded preview" className="w-full h-full object-cover" />
                           {isGenerating && (
                            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl transition-all duration-300">
                                <Icons.loading className="w-8 h-8 text-white animate-spin" />
                                <p className="text-white text-sm mt-2">風格重塑中，請稍候...</p>
                                <div className="absolute bottom-0 left-0 w-full h-1 bg-indigo-500/50">
                                    <div className="h-1 bg-indigo-400 animate-pulse w-full"></div>
                                </div>
                            </div>
                           )}
                        </div>
                        {uploadedImage.isRealistic && workflowStage === 'detect' && (
                           <div className="w-full p-4 bg-[#FFFBEB] border border-[#F59E0B] rounded-xl space-y-3 animate-fade-in">
                               <p className="text-sm text-amber-800 font-medium">建議重塑風格以匹配數字人</p>
                               <div className="flex items-center space-x-2">
                                   <button onClick={() => handleImageSelect(uploadedImage.url)} className="w-full py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50">使用原圖</button>
                                   <button onClick={() => setWorkflowStage('restyle')} className="w-full py-2 text-sm font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600">風格重塑</button>
                               </div>
                           </div>
                        )}
                        {workflowStage === 'restyle' && (
                            <div className="w-full space-y-4 animate-fade-in">
                                <div className="grid grid-cols-3 gap-2">
                                    {Object.entries(mockStyles).map(([name, url]) => (
                                      <div key={name} onClick={() => setSelectedStyle(name)} className={`relative rounded-xl cursor-pointer ring-2 ${selectedStyle === name ? 'ring-indigo-500' : 'ring-transparent'}`}>
                                        <img src={url} alt={name} className="w-full h-16 object-cover rounded-lg"/>
                                        <div className="absolute inset-0 bg-black/30 rounded-lg"></div>
                                        <p className="absolute bottom-1 left-2 text-xs font-bold text-white">{name}</p>
                                      </div>
                                    ))}
                                </div>
                                <div className="relative">
                                    <Icons.wand className="absolute top-1/2 left-3 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                                    <input type="text" placeholder="提示詞助手，例如：傍晚，海邊" className="w-full bg-slate-100 pl-9 pr-3 py-2.5 rounded-lg text-sm focus:ring-2 focus:ring-indigo-300" />
                                </div>
                                <button onClick={handleGenerate} disabled={isGenerating} className="w-full py-2.5 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400">生成</button>
                            </div>
                        )}
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
            <div className="bg-white w-full max-w-3xl rounded-3xl shadow-lg flex flex-col h-[70vh]">
                <div className="flex justify-between items-center p-4 border-b border-slate-200">
                    <h3 className="text-lg font-bold text-[#1E293B]">編輯背景圖</h3>
                    <button onClick={onCancel} className="p-2 rounded-full hover:bg-slate-100">
                        <Icons.close className="w-5 h-5 text-slate-500" />
                    </button>
                </div>
                <div className="p-2">
                    <div className="mb-4 bg-slate-100 p-1 rounded-xl flex items-center max-w-xs mx-auto">
                        <button 
                            onClick={() => { setActiveTab('templates'); setWorkflowStage('select'); setUploadedImage(null); }}
                            className={`w-full py-2 px-4 rounded-lg text-sm font-semibold transition-all ${activeTab === 'templates' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-200'}`}>
                            模板
                        </button>
                        <button 
                            onClick={() => setActiveTab('upload')}
                            className={`w-full py-2 px-4 rounded-lg text-sm font-semibold transition-all ${activeTab === 'upload' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-200'}`}>
                            上傳
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'templates' && (
                        <div className="grid grid-cols-3 gap-4">
                            {presetBackgrounds.map(bg => (
                                <img 
                                    key={bg} 
                                    src={bg} 
                                    onClick={() => handleImageSelect(bg)}
                                    className="w-full h-32 object-cover rounded-2xl cursor-pointer hover:ring-4 hover:ring-indigo-400 transition-all duration-200"
                                />
                            ))}
                        </div>
                    )}
                    {activeTab === 'upload' && renderUploadContent()}
                </div>
            </div>
        </div>
    );
};