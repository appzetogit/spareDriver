import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, ArrowRight, CheckCircle2, Mail, Phone, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../../../components/Button';
import api from '../../../utils/api';
import { SITE_LEGAL_PAGES } from '../constants/legalPages';
import { LANDING_LOGO_SRC } from '../components/LandingShell';

const LandingPage = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [siteConfig, setSiteConfig] = useState({
    supportPhone: '',
    supportEmail: '',
    contactAddress: '',
    supportHours: '',
    androidAppUrl: '',
    iosAppUrl: '',
  });

  useEffect(() => {
    document.title = 'SpareDriver - Professional Driver for Your Car | Safe, Verified, On-Time';

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute(
      'content',
      'Get safe, verified, and professional drivers for your car on-demand. SpareDriver offers hourly bookings, round trips, and subscription benefits with real-time tracking.',
    );

    let cancelled = false;
    api
      .get('/common/support-config')
      .then((res) => {
        if (!cancelled && res.data?.data) setSiteConfig((prev) => ({ ...prev, ...res.data.data }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const handleNavClick = (e, targetId) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const openStoreLink = (url) => {
    if (!url) {
      toast.error('App download link is not configured yet. Please check back soon.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="w-full min-h-screen bg-bg text-text selection:bg-primary/30 antialiased font-sans">
      <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-dark/95 border-b border-dark-light/40 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <a href="#" className="flex items-center gap-2 group" onClick={(e) => handleNavClick(e, 'home')}>
            <img
              src={LANDING_LOGO_SRC}
              alt="SpareDriver Logo"
              className="h-10 w-auto object-contain transition-transform duration-300 group-hover:scale-[1.02]"
              loading="eager"
            />
          </a>

          <nav className="hidden md:flex items-center gap-8">
            <a
              href="#home"
              onClick={(e) => handleNavClick(e, 'home')}
              className="text-sm font-medium text-text-muted hover:text-primary transition-colors"
            >
              Home
            </a>
            <a
              href="#features"
              onClick={(e) => handleNavClick(e, 'features')}
              className="text-sm font-medium text-text-muted hover:text-primary transition-colors"
            >
              Features
            </a>
            <a
              href="#about"
              onClick={(e) => handleNavClick(e, 'about')}
              className="text-sm font-medium text-text-muted hover:text-primary transition-colors"
            >
              About
            </a>
            <a
              href="#contact"
              onClick={(e) => handleNavClick(e, 'contact')}
              className="text-sm font-medium text-text-muted hover:text-primary transition-colors"
            >
              Contact
            </a>
          </nav>

          <div className="hidden md:block">
            <Button
              variant="primary"
              size="md"
              onClick={(e) => handleNavClick(e, 'download')}
              className="rounded-full font-bold shadow-md shadow-primary/10 hover:shadow-primary/20"
            >
              Download App
            </Button>
          </div>

          <button
            type="button"
            className="md:hidden p-2 text-white hover:text-primary focus:outline-none transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden absolute top-20 left-0 w-full bg-dark border-b border-dark-light/50 py-6 px-6 flex flex-col gap-6 animate-fade-in">
            <a
              href="#home"
              onClick={(e) => handleNavClick(e, 'home')}
              className="text-base font-semibold text-text-muted hover:text-primary transition-colors py-2 border-b border-dark-light/30"
            >
              Home
            </a>
            <a
              href="#features"
              onClick={(e) => handleNavClick(e, 'features')}
              className="text-base font-semibold text-text-muted hover:text-primary transition-colors py-2 border-b border-dark-light/30"
            >
              Features
            </a>
            <a
              href="#about"
              onClick={(e) => handleNavClick(e, 'about')}
              className="text-base font-semibold text-text-muted hover:text-primary transition-colors py-2 border-b border-dark-light/30"
            >
              About
            </a>
            <a
              href="#contact"
              onClick={(e) => handleNavClick(e, 'contact')}
              className="text-base font-semibold text-text-muted hover:text-primary transition-colors py-2"
            >
              Contact
            </a>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={(e) => handleNavClick(e, 'download')}
              className="rounded-full font-bold mt-2 shadow-lg shadow-primary/20"
            >
              Download App
            </Button>
          </div>
        )}
      </header>

      <section id="home" className="relative bg-dark pt-16 pb-24 md:py-32 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-primary/2 blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6 md:space-y-8 animate-fade-in-up">
            <div className="w-48 md:w-56 mb-4">
              <img
                src={LANDING_LOGO_SRC}
                alt="SpareDriver Logo"
                className="w-full h-auto object-contain"
                loading="eager"
              />
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight">
              Your Car.
              <br />
              <span className="text-primary">Our Professional Driver.</span>
            </h1>

            <p className="text-base md:text-lg text-text-muted max-w-xl leading-relaxed">
              Safe. Verified. On-Time. Enjoy a premium, seamless travel experience with our on-demand,
              hourly, or round-trip professional driver services. We handle the wheel, you command the
              journey.
            </p>

            <div className="pt-2">
              <Button
                variant="primary"
                size="lg"
                onClick={(e) => handleNavClick(e, 'download')}
                className="rounded-full px-8 py-6 text-base font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-transform duration-200 hover:scale-[1.02] flex items-center gap-3"
              >
                <span>Download App</span>
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <div
            className="lg:col-span-5 flex justify-center items-center relative animate-fade-in-up"
            style={{ animationDelay: '0.15s' }}
          >
            <div className="relative w-full max-w-sm md:max-w-md aspect-square bg-gradient-to-b from-dark-light to-dark border border-dark-lighter/50 rounded-3xl p-8 flex items-center justify-center shadow-2xl">
              <div className="absolute inset-4 rounded-3xl border border-dashed border-primary/10 animate-[spin_100s_linear_infinite] pointer-events-none" />
              <div className="absolute w-48 h-48 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
              <div className="relative z-10 text-center space-y-4">
                <img
                  src="/images/car-driver.png"
                  alt="Premium Booking Experience"
                  className="w-56 h-auto object-contain mx-auto drop-shadow-[0_15px_30px_rgba(255,216,111,0.2)]"
                  loading="eager"
                />
                <div className="bg-dark/80 backdrop-blur-sm border border-dark-lighter/60 px-4 py-2.5 rounded-full inline-flex items-center gap-2 text-xs font-semibold text-primary">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Premium Driver Network Active
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-24 bg-white border-b border-border/40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-dark">
              Premium Features for a Seamless Ride
            </h2>
            <div className="w-16 h-1.5 bg-primary mx-auto rounded-full" />
            <p className="text-text-secondary text-sm md:text-base">
              Experience driver booking designed to save you time and maximize convenience.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            <div className="bg-bg rounded-2xl p-8 border border-border-light flex flex-col justify-between items-center text-center shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
              <div className="space-y-6">
                <div className="h-44 flex items-center justify-center">
                  <img
                    src="/images/user/car.png"
                    alt="Fast and reliable service"
                    className="max-h-36 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <h3 className="text-xl font-bold text-dark">Fast & Reliable Service</h3>
                <p className="text-text-secondary text-sm leading-relaxed">
                  Seamless booking and tracking experience. Get paired with nearby drivers instantly and
                  see their location update in real-time.
                </p>
              </div>
              <div
                className="mt-8 text-xs font-semibold text-primary-dark group-hover:underline flex items-center gap-1 cursor-pointer"
                onClick={(e) => handleNavClick(e, 'download')}
              >
                Get Started <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="bg-bg rounded-2xl p-8 border border-border-light flex flex-col justify-between items-center text-center shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
              <div className="space-y-6">
                <div className="h-44 flex items-center justify-center">
                  <img
                    src="/images/user/clock.png"
                    alt="Save time and updates"
                    className="max-h-36 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <h3 className="text-xl font-bold text-dark">Instant Real-Time Access</h3>
                <p className="text-text-secondary text-sm leading-relaxed">
                  Save time with instant access and real-time updates. Check trip statuses, driver ETAs,
                  and trip progression updates dynamically on your dashboard.
                </p>
              </div>
              <div
                className="mt-8 text-xs font-semibold text-primary-dark group-hover:underline flex items-center gap-1 cursor-pointer"
                onClick={(e) => handleNavClick(e, 'download')}
              >
                Get Started <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="bg-bg rounded-2xl p-8 border border-border-light flex flex-col justify-between items-center text-center shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
              <div className="space-y-6">
                <div className="h-44 flex items-center justify-center">
                  <img
                    src="/images/user/subscription.png"
                    alt="Subscription plans"
                    className="max-h-36 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <h3 className="text-xl font-bold text-dark">Subscription & Benefits</h3>
                <p className="text-text-secondary text-sm leading-relaxed">
                  Subscription plans and premium benefits. Save more with tailored monthly driver passes,
                  loyalty perks, and dedicated high-priority booking channels.
                </p>
              </div>
              <div
                className="mt-8 text-xs font-semibold text-primary-dark group-hover:underline flex items-center gap-1 cursor-pointer"
                onClick={(e) => handleNavClick(e, 'download')}
              >
                Get Started <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="py-24 bg-bg border-b border-border/40">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          <div className="lg:col-span-7 space-y-6 md:space-y-8">
            <div className="space-y-2">
              <span className="text-xs uppercase tracking-wider font-bold text-primary-dark bg-primary/10 px-3.5 py-1.5 rounded-full">
                About SpareDriver
              </span>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-dark pt-2">
                Elevating the Chauffeur Experience
              </h2>
            </div>

            <p className="text-text-secondary text-sm md:text-base leading-relaxed">
              SpareDriver is a secure driver network bridging the gap between professional, vetted
              chauffeurs and private car owners. We understand that driving can be stressful, tiring, or
              simply a distraction from your busy schedule. Our platform allows you to hire safe, expert
              drivers for any purpose, letting you reclaim your travel time.
            </p>

            <p className="text-text-secondary text-sm md:text-base leading-relaxed">
              We focus on building a service you can count on. Every driver undergoes a rigorous
              validation process, including back-end credential audits, driving tests, and security
              background reviews. We keep things clean, reliable, and straightforward.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <span className="text-sm font-semibold text-dark">Simplicity</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <span className="text-sm font-semibold text-dark">Convenience</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <span className="text-sm font-semibold text-dark">Reliability</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-full max-w-sm rounded-3xl overflow-hidden bg-white border border-border-light shadow-xl p-8 flex flex-col justify-center gap-8">
              <h4 className="text-lg font-bold text-dark text-center border-b border-border pb-4">
                Why Users Trust SpareDriver
              </h4>
              <ul className="space-y-4">
                <li className="flex gap-3.5">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary-dark font-bold text-xs">
                    1
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-dark">Strict Verification</h5>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Identity background audits, license checks, and hands-on validation.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3.5">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary-dark font-bold text-xs">
                    2
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-dark">On-Time Guarantee</h5>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Drivers arrive precisely at your scheduled time, tracked live.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3.5">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary-dark font-bold text-xs">
                    3
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-dark">24/7 Booking Support</h5>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Our support network monitors trips for passenger peace of mind.
                    </p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="download" className="py-24 bg-dark relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full bg-primary/5 blur-3xl pointer-events-none" />

        <div className="max-w-4xl mx-auto px-6 text-center relative z-10 space-y-8 animate-fade-in-up">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white leading-tight">
            Ready to Travel Stress-Free?
          </h2>
          <p className="text-text-muted text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            Get the SpareDriver app on your smartphone to instantly book verified drivers, schedule
            round trips, and track drivers in real-time.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-4">
            <Button
              variant="primary"
              size="xl"
              onClick={() => openStoreLink(siteConfig.androidAppUrl)}
              className="rounded-full font-bold px-8 shadow-xl shadow-primary/10 hover:shadow-primary/20 hover:scale-[1.02] transition-transform duration-200 w-full sm:w-auto"
            >
              Download for Android
            </Button>
            <Button
              variant="dark"
              size="xl"
              onClick={() => openStoreLink(siteConfig.iosAppUrl)}
              className="rounded-full font-bold px-8 ring-1 ring-white/25 hover:ring-white/40 hover:scale-[1.02] transition-transform duration-200 w-full sm:w-auto"
            >
              Download for iOS
            </Button>
          </div>
        </div>
      </section>

      <section id="contact" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-dark">Get in Touch</h2>
            <div className="w-16 h-1.5 bg-primary mx-auto rounded-full" />
            <p className="text-text-secondary text-sm md:text-base">
              Have questions or need assistance? Our support team is here to help you.
            </p>
          </div>

          <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-bg border border-border-light rounded-2xl p-6 text-center space-y-3 flex flex-col items-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary-dark">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-dark text-base">Email Us</h3>
              <p className="text-xs text-text-secondary">For support and business inquiries</p>
              {siteConfig.supportEmail ? (
                <a
                  href={`mailto:${siteConfig.supportEmail}`}
                  className="text-sm font-semibold text-primary-dark hover:underline mt-2 break-all"
                >
                  {siteConfig.supportEmail}
                </a>
              ) : (
                <p className="text-sm text-text-secondary mt-2">Coming soon</p>
              )}
            </div>

            <div className="bg-bg border border-border-light rounded-2xl p-6 text-center space-y-3 flex flex-col items-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary-dark">
                <Phone className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-dark text-base">Call Support</h3>
              <p className="text-xs text-text-secondary">
                {siteConfig.supportHours || 'Support hours coming soon'}
              </p>
              {siteConfig.supportPhone ? (
                <a
                  href={`tel:${siteConfig.supportPhone}`}
                  className="text-sm font-semibold text-primary-dark hover:underline mt-2"
                >
                  {siteConfig.supportPhone}
                </a>
              ) : (
                <p className="text-sm text-text-secondary mt-2">Coming soon</p>
              )}
            </div>

            <div className="bg-bg border border-border-light rounded-2xl p-6 text-center space-y-3 flex flex-col items-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary-dark">
                <MapPin className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-dark text-base">Office</h3>
              <p className="text-xs text-text-secondary">Headquarters location</p>
              <p className="text-sm font-semibold text-dark mt-2 whitespace-pre-wrap">
                {siteConfig.contactAddress || 'Coming soon'}
              </p>
            </div>
          </div>

          <div className="text-center mt-10">
            <Link to="/contact-us" className="text-sm font-semibold text-primary-dark hover:underline">
              View full contact page
            </Link>
          </div>
        </div>
      </section>

      <footer className="bg-dark text-text-muted border-t border-dark-light/50 py-16">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-12 items-start">
          <div className="md:col-span-6 space-y-4">
            <img
              src={LANDING_LOGO_SRC}
              alt="SpareDriver Logo"
              className="h-10 w-auto object-contain"
              loading="lazy"
            />
            <p className="text-sm text-text-muted max-w-sm leading-relaxed">
              Reclaim your travel time. Hire premium, fully background-checked professional drivers to
              drive your own car, available on-demand, hourly, or for round trips.
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
          <p>Designed with excellence for SpareDriver private vehicle owners.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
