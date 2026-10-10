import { InstagramIcon, LinkedInIcon, FacebookIcon, YouTubeIcon } from '../components/BrandIcons';

// Tracking params (utm_source, stkn, mibextid) stripped — the pages resolve the same without them
export const SOCIAL_LINKS = [
  { name: 'Instagram', handle: '@aicourseforge', href: 'https://www.instagram.com/aicourseforge/', Icon: InstagramIcon },
  { name: 'LinkedIn', handle: 'courseforge.ai', href: 'https://www.linkedin.com/company/courseforge.ai/', Icon: LinkedInIcon },
  { name: 'Facebook', handle: 'CourseForge', href: 'https://www.facebook.com/share/19RvG1STBQ/', Icon: FacebookIcon },
  { name: 'YouTube', handle: '@Courseforgeapp_ai', href: 'https://www.youtube.com/@Courseforgeapp_ai', Icon: YouTubeIcon },
];

export const FEEDBACK_URL = 'https://form.typeform.com/to/DzZlxAbi';

// _blank, not a same-tab link: in the iOS app Capacitor hands _blank to
// UIApplication.open, so Safari (or the Instagram/LinkedIn/YouTube app) opens and the
// webview stays put. A same-tab link would navigate the app away from itself.
export const externalLinkProps = { target: '_blank', rel: 'noopener noreferrer' };
