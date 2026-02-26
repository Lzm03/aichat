import React, { useState } from 'react';

interface IosToggleProps {
  initialValue?: boolean;
  label?: string;
}

export const IosToggle: React.FC<IosToggleProps> = ({ initialValue = false, label }) => {
  const [isOn, setIsOn] = useState(initialValue);

  return (
    <label className="flex items-center cursor-pointer">
      {label && <span className="mr-3 text-sm font-medium text-slate-600">{label}</span>}
      <div className="relative">
        <input 
          type="checkbox" 
          checked={isOn}
          onChange={() => setIsOn(!isOn)}
          className="sr-only peer" 
        />
        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-indigo-300 peer-checked:bg-indigo-600 transition-colors duration-300"></div>
        <div className="absolute top-0.5 left-[2px] bg-white border-slate-200 border rounded-full h-5 w-5 peer-checked:translate-x-full transition-transform duration-300 shadow-sm"></div>
      </div>
    </label>
  );
};
