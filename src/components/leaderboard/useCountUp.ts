import { useEffect, useState } from 'react'
import { animate } from 'framer-motion'

/** Animates 0 → target with an ease-out count-up whenever target changes.
 *  Returns the live value for formatting at the call site. */
export function useCountUp(target: number, duration = 1.1, delay = 0): number {
  const [val, setVal] = useState(0)
  useEffect(() => {
    const controls = animate(0, target, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setVal(v),
    })
    return () => controls.stop()
  }, [target, duration, delay])
  return val
}
