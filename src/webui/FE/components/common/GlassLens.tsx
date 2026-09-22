import React, { useEffect, useRef } from 'react'
import { registerGlass, unregisterGlass } from '../../utils/glassRuntime'

/*
 * Drop in as the first child of a glass element that sits on bare wallpaper.
 * Registers the parent with the glass runtime, which keeps a refracted copy
 * of the wallpaper under the element (the canvas rendered here) and samples
 * its luminance for the adaptive tint. lens={false} keeps only the sampling.
 */
interface Props {
  lens?: boolean
}

const GlassLens: React.FC<Props> = ({ lens = true }) => {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    registerGlass(parent, lens ? canvas : null)
    return () => unregisterGlass(parent)
  }, [lens])

  return <canvas ref={ref} aria-hidden='true' className='ll-lens' hidden={!lens} />
}

export default GlassLens
