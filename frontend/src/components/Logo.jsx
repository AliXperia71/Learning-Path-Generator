import markDark from '../assets/logo-mark.png';
import markLight from '../assets/logo-mark-light.png';
import fullDark from '../assets/logo-full.png';
import fullLight from '../assets/logo-full-light.png';

/**
 * The CourseForge logo.
 *
 * Two artwork variants ship: the navy original for light backgrounds, and one
 * where the navy is lifted to near-white for dark backgrounds. The ember orange
 * is identical in both — it's the one colour that reads on either ground.
 *
 * The variant is chosen in JS from the theme the app already tracks, rather
 * than with `hidden dark:block`, so only one file is ever downloaded. The theme
 * is read synchronously from localStorage before first paint, so there's no
 * flash of the wrong one.
 *
 *   variant="mark"  the anvil alone — navbar, tight spaces
 *   variant="full"  the anvil plus the wordmark — sign-in, empty states
 */
export default function Logo({ theme, variant = 'mark', className = '', alt = 'CourseForge' }) {
  const isDark = theme === 'dark';
  const src = variant === 'full' ? (isDark ? fullLight : fullDark) : (isDark ? markLight : markDark);

  return <img src={src} alt={alt} className={className} draggable="false" />;
}
