import React, { useEffect, useState } from 'react';
import { useReducedMotion, useSpring } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  className?: string;
}

// Overdamped on purpose: the roll settles in ~0.4s with no overshoot, so a count
// that lands on the same number twice in a row (the 15s poll) never wobbles.
const SPRING = { stiffness: 220, damping: 28, mass: 0.7 };

/**
 * A number that rolls to its new value instead of snapping, so a background
 * refresh is visible to the teacher. Falls back to the plain value when the OS
 * asks for reduced motion — a rolling value is written frame by frame from here,
 * not by a transform, so MotionConfig cannot cover it.
 */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({ value, className }) => {
  const prefersReducedMotion = useReducedMotion();
  const spring = useSpring(value, SPRING);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplay(value);
      return;
    }
    const unsubscribe = spring.on('change', (latest) => setDisplay(Math.round(latest)));
    spring.set(value);
    return unsubscribe;
  }, [spring, value, prefersReducedMotion]);

  // tabular-nums keeps the digits from shifting the layout mid-roll
  return <span className={`inline-block tabular-nums ${className ?? ''}`}>{display}</span>;
};
