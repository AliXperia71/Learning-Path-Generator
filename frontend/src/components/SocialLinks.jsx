import { MessageSquareHeart } from 'lucide-react';
import { SOCIAL_LINKS, FEEDBACK_URL, externalLinkProps } from '../utils/socialLinks';

// Sign-in page footer: icon row + feedback link, below the auth card
export function SocialFooter({ className = '' }) {
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div className="flex items-center gap-1">
        {SOCIAL_LINKS.map(({ name, href, Icon }) => (
          <a
            key={name}
            href={href}
            {...externalLinkProps}
            aria-label={`CourseForge on ${name}`}
            title={name}
            className="p-3 rounded-xl text-muted hover:text-ink hover:bg-card transition-colors"
          >
            <Icon size={18} />
          </a>
        ))}
      </div>
      <a
        href={FEEDBACK_URL}
        {...externalLinkProps}
        className="py-2 text-xs text-accent font-semibold hover:underline inline-flex items-center gap-1.5"
      >
        <MessageSquareHeart size={13} /> Share feedback
      </a>
    </div>
  );
}
