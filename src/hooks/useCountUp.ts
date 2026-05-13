import { useState, useEffect, useRef } from "react";

export function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(target);
  const rafRef = useRef<number>(0);
  const valueRef = useRef(value);
  const startTimeRef = useRef(0);

  useEffect(() => {
    const startValue = valueRef.current;
    startTimeRef.current = 0;

    function animate(now: number) {
      if (!startTimeRef.current) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = Math.round(
        startValue + (target - startValue) * eased
      );
      setValue(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}
