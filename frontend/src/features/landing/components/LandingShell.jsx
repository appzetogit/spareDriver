import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../../utils/api';
import { SITE_LEGAL_PAGES } from '../constants/legalPages';
import { LANDING_SOCIAL_PLATFORMS } from '../constants/socialLinks';

export const LANDING_LOGO_SRC = '/images/yellow-logo.jpeg';

function SocialSvg({ children }) {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
      {children}
    </svg>
  );
}

const SOCIAL_ICONS = {
  instagramUrl: () => (
    <SocialSvg>
      <path d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm5 4.8A4.2 4.2 0 1 0 16.2 12 4.2 4.2 0 0 0 12 7.8Zm0 6.9A2.7 2.7 0 1 1 14.7 12 2.7 2.7 0 0 1 12 14.7ZM17.35 6.4a1 1 0 1 0 1 1 1 1 0 0 0-1-1Z" />
    </SocialSvg>
  ),
  facebookUrl: () => (
    <SocialSvg>
      <path d="M14.5 8.5h2.2V5.4h-2.2c-2.7 0-4.5 1.7-4.5 4.4V12H7.8v3.2h2.2V21h3.3v-5.8h2.5l.5-3.2h-3V10c0-.9.3-1.5 1.2-1.5Z" />
    </SocialSvg>
  ),
  twitterUrl: () => (
    <SocialSvg>
      <path d="M14.7 10.4 21.4 3h-1.6l-5.8 6.4L9.4 3H3.1l7 9.8L3.1 21h1.6l6.1-6.8 4.9 6.8h6.3l-7.3-10.6Zm-2.2 2.4-.7-1-5.6-7.7h2.4l4.5 6.3.7 1 5.9 8.1h-2.4l-4.8-6.7Z" />
    </SocialSvg>
  ),
  linkedinUrl: () => (
    <SocialSvg>
      <path d="M6.5 9.2H3.7V20h2.8V9.2ZM5.1 4C4.1 4 3.3 4.8 3.3 5.8S4.1 7.6 5.1 7.6 6.9 6.8 6.9 5.8 6.1 4 5.1 4ZM20.3 13.3c0-3.2-1.7-4.7-4-4.7-1.8 0-2.6 1-3.1 1.7V9.2H10.4c0 1.8 0 10.8 0 10.8h2.8v-6c0-.3 0-.7.1-1 .3-.7.9-1.5 2-1.5 1.4 0 2 1.1 2 2.6V20h2.8v-6.7Z" />
    </SocialSvg>
  ),
  youtubeUrl: () => (
    <SocialSvg>
      <path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15.4V8.6l5.5 3.4L10 15.4Z" />
    </SocialSvg>
  ),
};

const EMPTY_SOCIAL = {
  instagramUrl: '',
  facebookUrl: '',
  twitterUrl: '',
  linkedinUrl: '',
  youtubeUrl: '',
};

export function LandingSocialLinks({ urls = EMPTY_SOCIAL, className = '' }) {
  const openSocial = (e, name, href) => {
    if (href) return;
    e.preventDefault();
    toast.error(`${name} link is not configured yet.`);
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {LANDING_SOCIAL_PLATFORMS.map((platform) => {
        const Icon = SOCIAL_ICONS[platform.key];
        const href = urls[platform.key]?.trim();
        return (
          <a
            key={platform.key}
            href={href || '#'}
            target={href ? '_blank' : undefined}
            rel={href ? 'noopener noreferrer' : undefined}
            onClick={(e) => openSocial(e, platform.name, href)}
            aria-label={platform.name}
            className="w-10 h-10 rounded-full bg-white/10 text-white hover:bg-[#F5C400] hover:text-black transition-colors flex items-center justify-center"
          >
            <Icon />
          </a>
        );
      })}
    </div>
  );
}

export function LandingHeader({ backToHome = false }) {
  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-white/90 border-b border-black/8 h-24 flex items-center">
      <div className="max-w-7xl mx-auto px-6 w-full flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <img
            src={LANDING_LOGO_SRC}
            alt="SpareDriver"
            className="h-16 w-auto object-contain rounded-xl transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </Link>
        {backToHome ? (
          <Link
            to="/"
            className="text-sm font-semibold text-neutral-600 hover:text-black transition-colors"
          >
            Back to Home
          </Link>
        ) : null}
      </div>
    </header>
  );
}

export function LandingFooter({ socialUrls }) {
  const [urls, setUrls] = useState(socialUrls || EMPTY_SOCIAL);

  useEffect(() => {
    if (socialUrls) {
      setUrls({ ...EMPTY_SOCIAL, ...socialUrls });
      return undefined;
    }

    let cancelled = false;
    api
      .get('/common/support-config')
      .then((res) => {
        if (!cancelled && res.data?.data) {
          setUrls((prev) => ({ ...prev, ...res.data.data }));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [socialUrls]);

  return (
    <footer className="bg-black text-neutral-400 border-t border-white/10 py-16 w-full">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-12 items-start">
        <div className="md:col-span-6 space-y-5">
          <img
            src={LANDING_LOGO_SRC}
            alt="SpareDriver"
            className="h-16 w-auto object-contain rounded-xl"
          />
          <p className="text-sm text-neutral-400 max-w-sm leading-relaxed">
            Reclaim your travel time. Hire premium, fully background-checked professional drivers
            to drive your own car, available on-demand.
          </p>
          <LandingSocialLinks urls={urls} />
        </div>

        <div className="md:col-span-6 md:justify-self-end grid grid-cols-2 gap-12">
          <div className="space-y-4">
            <h4 className="text-xs uppercase font-bold text-white tracking-widest">Legal</h4>
            <ul className="space-y-2.5 text-sm">
              {SITE_LEGAL_PAGES.map((page) => (
                <li key={page.type}>
                  <Link to={page.path} className="hover:text-[#F5C400] transition-colors">
                    {page.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs uppercase font-bold text-white tracking-widest">Connect</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link to="/contact-us" className="hover:text-[#F5C400] transition-colors">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-12 mt-12 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500 gap-4">
        <p>© {new Date().getFullYear()} SpareDriver. All rights reserved.</p>
      </div>
    </footer>
  );
}
