import { Link } from 'react-router-dom';
import { SITE_LEGAL_PAGES } from '../constants/legalPages';

const LOGO_SRC = '/images/logo-white.png';

export function LandingHeader({ backToHome = false }) {
  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-dark/95 border-b border-dark-light/40 h-20 flex items-center">
      <div className="max-w-7xl mx-auto px-6 w-full flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <img
            src={LOGO_SRC}
            alt="SpareDriver Logo"
            className="h-10 w-auto object-contain transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </Link>
        {backToHome ? (
          <Link
            to="/"
            className="text-sm font-semibold text-text-muted hover:text-primary transition-colors"
          >
            Back to Home
          </Link>
        ) : null}
      </div>
    </header>
  );
}

export function LandingFooter() {
  return (
    <footer className="bg-dark text-text-muted border-t border-dark-light/50 py-16 w-full">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-12 items-start">
        <div className="md:col-span-6 space-y-4">
          <img
            src={LOGO_SRC}
            alt="SpareDriver Logo"
            className="h-10 w-auto object-contain"
          />
          <p className="text-sm text-text-muted max-w-sm leading-relaxed">
            Reclaim your travel time. Hire premium, fully background-checked professional drivers
            to drive your own car, available on-demand.
          </p>
        </div>

        <div className="md:col-span-6 md:justify-self-end grid grid-cols-2 gap-12">
          <div className="space-y-4">
            <h4 className="text-xs uppercase font-bold text-white tracking-widest">Legal</h4>
            <ul className="space-y-2.5 text-sm">
              {SITE_LEGAL_PAGES.map((page) => (
                <li key={page.type}>
                  <Link to={page.path} className="hover:text-primary transition-colors">
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
                <Link to="/contact-us" className="hover:text-primary transition-colors">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-12 mt-12 border-t border-dark-light/40 flex flex-col sm:flex-row items-center justify-between text-xs text-text-muted gap-4">
        <p>© {new Date().getFullYear()} SpareDriver. All rights reserved.</p>
      </div>
    </footer>
  );
}

export const LANDING_LOGO_SRC = LOGO_SRC;
