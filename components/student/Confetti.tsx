import React from 'react';
import { motion } from 'framer-motion';

const NUM_CONFETTI = 50;
const COLORS = ["#4f46e5", "#10b981", "#f97316", "#8b5cf6", "#f59e0b"];

const random = (min: number, max: number) => Math.random() * (max - min) + min;

export const Confetti: React.FC = () => {
    return (
        <div className="absolute inset-0 pointer-events-none z-50">
            {Array.from({ length: NUM_CONFETTI }).map((_, i) => (
                <motion.div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                        backgroundColor: COLORS[i % COLORS.length],
                        width: random(6, 12),
                        height: random(6, 12),
                        top: '-10%',
                        left: `${random(0, 100)}%`,
                    }}
                    initial={{ opacity: 1, y: 0, x: 0 }}
                    animate={{
                        y: '110vh',
                        x: random(-200, 200),
                        rotate: random(0, 360),
                        opacity: [1, 1, 0],
                    }}
                    transition={{
                        duration: random(3, 6),
                        ease: "linear",
                        delay: random(0, 1),
                    }}
                />
            ))}
        </div>
    );
};
