'use client';
import React, { useState } from 'react';
import { StarMap } from '@/components/student/StarMap';
import { AnimatePresence } from 'framer-motion';
import { Confetti } from '@/components/student/Confetti';

export default function DashboardPage() {
  const [showConfetti, setShowConfetti] = useState(false);

  const handleMissionComplete = (missionId: string) => {
    console.log(`Mission ${missionId} completed!`);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 5000); // Hide confetti after 5 seconds
  };

  return (
    <div className="w-full h-full relative">
      <AnimatePresence>
        {showConfetti && <Confetti />}
      </AnimatePresence>
      <StarMap onMissionClick={handleMissionComplete} />
    </div>
  );
}
