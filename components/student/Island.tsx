import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../icons';

interface IslandProps {
  id: string;
  name: string;
  difficulty: string;
  status: 'completed' | 'active' | 'locked';
  position: { top: string; left: string };
  onClick: () => void;
}

export const Island: React.FC<IslandProps> = ({ name, difficulty, status, position, onClick }) => {
  const isLocked = status === 'locked';
  const isActive = status === 'active';
  const isCompleted = status === 'completed';
  
  const islandVariants = {
    initial: { scale: 0.8, opacity: 0 },
    animate: { scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 20 } },
  };

  return (
    <motion.div
      className="absolute"
      style={{ ...position, transform: 'translate(-50%, -50%)' }}
      variants={islandVariants}
      initial="initial"
      animate="animate"
    >
      <motion.button
        // 【AI Bot 任務點】
        onClick={!isLocked ? onClick : undefined}
        disabled={isLocked}
        className={`relative w-24 h-24 rounded-full shadow-lg transition-all duration-300 group ${
          isLocked ? 'cursor-not-allowed' : 'cursor-pointer'
        }`}
        whileHover={!isLocked ? { scale: 1.1 } : {}}
        whileTap={!isLocked ? { scale: 0.95 } : {}}
      >
        <div className={`w-full h-full rounded-full transition-all duration-300 ${
          isCompleted ? 'bg-gradient-to-br from-emerald-400 to-teal-500' :
          isActive ? 'bg-gradient-to-br from-indigo-500 to-violet-600' :
          'bg-gradient-to-br from-slate-300 to-slate-400'
        }`}>
            {isActive && (
                <motion.div 
                    className="absolute inset-0 rounded-full ring-4 ring-indigo-400 ring-offset-2 ring-offset-white/80"
                    animate={{ scale: [1, 1.2, 1], opacity: [0, 0.7, 0] }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                />
            )}
        </div>
        
        {isLocked && (
          <div className="absolute inset-0 bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center">
            <Icons.lock className="w-8 h-8 text-slate-800" />
          </div>
        )}

        {isCompleted && (
           <div className="absolute -top-2 -right-2 bg-emerald-500 text-white w-7 h-7 rounded-full flex items-center justify-center border-2 border-white shadow-md">
             <Icons.success className="w-4 h-4" />
           </div>
        )}

        <AnimatePresence>
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <div className="px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg shadow-xl">
            {name} <span className="font-normal opacity-80">({difficulty})</span>
          </div>
        </div>
        </AnimatePresence>
      </motion.button>
    </motion.div>
  );
};
