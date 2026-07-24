'use client';

interface StageFrameMaskProps {
  /** The scene's width / height ratio — the picture's shape. */
  aspectRatio: number;
  /** Letterbox colour; must match the page background behind the canvas. */
  color: string;
}

/**
 * Hides everything outside the picture's frame.
 *
 * Layers render at `baseScale` (usually slightly >1) and are parallax-offset, so
 * content sitting at the photo's edge — an animal's legs at the bottom of frame —
 * slides out past the picture and would otherwise float in the letterbox.
 *
 * This is a DOM mask rather than geometry inside the canvas: an in-scene matte has
 * to win three.js' transparent-draw ordering against every layer, overlay and
 * effect pass, and quietly loses to some of them. A sibling element always paints
 * above the canvas. It is one box: sized to the same contain-fit rect the WebGL
 * stage uses (identical maths — same aspect, same box), with a `box-shadow`
 * spread far enough to flood the rest of the container.
 */
export function StageFrameMask({ aspectRatio, color }: StageFrameMaskProps) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          aspectRatio: String(aspectRatio),
          height: '100%',
          maxWidth: '100%',
          maxHeight: '100%',
          boxShadow: `0 0 0 9999px ${color}`,
        }}
      />
    </div>
  );
}
