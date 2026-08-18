import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Menu,
  X,
  ArrowRight,
  CheckCircle2,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  Clock,
  Radio,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../../../components/Button';
import api from '../../../utils/api';
import { LandingFooter, LANDING_LOGO_SRC } from '../components/LandingShell';

const NAV_LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'features', label: 'Features' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
];

const LandingPage = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [siteConfig, setSiteConfig] = useState({
    supportPhone: '',
    supportEmail: '',
    contactAddress: '',
    supportHours: '',
    androidAppUrl: '',
    iosAppUrl: '',
    instagramUrl: '',
    facebookUrl: '',
    twitterUrl: '',
    linkedinUrl: '',
    youtubeUrl: '',
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
    <div className="w-full min-h-screen bg-[#FAFAF7] text-neutral-900 selection:bg-[#F5C400]/40 antialiased font-sans">
      <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-white/90 border-b border-black/8">
        <div className="max-w-7xl mx-auto px-6 h-24 flex items-center justify-between">
          <a href="#home" className="flex items-center gap-2 group" onClick={(e) => handleNavClick(e, 'home')}>
            <img
              src={LANDING_LOGO_SRC}
              alt="SpareDriver"
              className="h-16 w-auto object-contain rounded-xl transition-transform duration-300 group-hover:scale-[1.02]"
              loading="eager"
            />
          </a>

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={(e) => handleNavClick(e, link.id)}
                className="text-sm font-medium text-neutral-600 hover:text-black transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:block">
            <Button
              variant="dark"
              size="md"
              onClick={(e) => handleNavClick(e, 'download')}
              className="rounded-full font-bold"
            >
              Download App
            </Button>
          </div>

          <button
            type="button"
            className="md:hidden p-2 text-neutral-800 hover:text-black focus:outline-none transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden absolute top-20 left-0 w-full bg-white border-b border-black/8 py-6 px-6 flex flex-col gap-4 shadow-lg">
            {NAV_LINKS.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={(e) => handleNavClick(e, link.id)}
                className="text-base font-semibold text-neutral-700 hover:text-black transition-colors py-2 border-b border-neutral-100"
              >
                {link.label}
              </a>
            ))}
            <Button
              variant="dark"
              size="lg"
              fullWidth
              onClick={(e) => handleNavClick(e, 'download')}
              className="rounded-full font-bold mt-2"
            >
              Download App
            </Button>
          </div>
        )}
      </header>

      <section id="home" className="relative overflow-hidden bg-[#FFF8D6] pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-[#F5C400]/50 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[380px] h-[380px] rounded-full bg-[#F5C400]/30 blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
          <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6 md:space-y-7 animate-fade-in-up">
            <span className="inline-flex items-center gap-2 bg-black text-[#F5C400] text-[11px] font-bold uppercase tracking-[0.16em] px-3.5 py-1.5 rounded-full">
              Verified drivers for your car
            </span>

            <h1 className="text-4xl md:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight text-black leading-[1.08]">
              Your car.
              <br />
              Our professional driver.
            </h1>

            <p className="text-base md:text-lg text-neutral-700 max-w-xl leading-relaxed">
              Safe. Verified. On-time. Book an on-demand, hourly, or round-trip driver for your own
              car — we handle the wheel so you can enjoy the journey.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
              <Button
                variant="dark"
                size="lg"
                onClick={(e) => handleNavClick(e, 'download')}
                className="rounded-full px-8 font-bold hover:scale-[1.02] transition-transform duration-200"
              >
                <span>Download App</span>
                <ArrowRight className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={(e) => handleNavClick(e, 'features')}
                className="rounded-full px-8 font-bold border-black/15 bg-white/70"
              >
                See features
              </Button>
            </div>

            <ul className="flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-2 pt-2 text-sm font-semibold text-neutral-800">
              <li className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-black" />
                Background-checked
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-black" />
                On-time arrival
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-black" />
                Live tracking
              </li>
            </ul>
          </div>

          <div
            className="lg:col-span-5 flex justify-center items-center relative animate-fade-in-up"
            style={{ animationDelay: '0.12s' }}
          >
            <div className="relative w-full max-w-sm md:max-w-md flex flex-col items-center">
              <img
                src="/images/car-driver.png"
                alt="Professional driver with your car"
                className="w-full h-auto object-contain drop-shadow-xl"
                loading="eager"
              />
              <div className="mt-4 bg-black text-[#F5C400] px-4 py-2.5 rounded-full inline-flex items-center gap-2 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Driver network live
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-24 bg-white border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-black">
              Built for a seamless ride
            </h2>
            <div className="w-16 h-1.5 bg-[#F5C400] mx-auto rounded-full" />
            <p className="text-neutral-600 text-sm md:text-base">
              Driver booking designed to save you time and keep every trip simple.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            <div className="bg-[#FAFAF7] rounded-2xl p-8 border border-neutral-100 flex flex-col justify-between items-center text-center shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
              <div className="space-y-6">
                <div className="h-44 flex items-center justify-center">
                  <img
                    src="/images/user/car.png"
                    alt="Fast and reliable service"
                    className="max-h-36 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <h3 className="text-xl font-bold text-black">Fast & Reliable Service</h3>
                <p className="text-neutral-600 text-sm leading-relaxed">
                  Seamless booking and tracking. Get paired with nearby drivers instantly and see
                  their location update in real time.
                </p>
              </div>
              <button
                type="button"
                className="mt-8 text-xs font-semibold text-black group-hover:underline flex items-center gap-1"
                onClick={(e) => handleNavClick(e, 'download')}
              >
                Get Started <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="bg-[#FAFAF7] rounded-2xl p-8 border border-neutral-100 flex flex-col justify-between items-center text-center shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
              <div className="space-y-6">
                <div className="h-44 flex items-center justify-center">
                  <img
                    src="/images/user/clock.png"
                    alt="Save time and updates"
                    className="max-h-36 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <h3 className="text-xl font-bold text-black">Instant Real-Time Access</h3>
                <p className="text-neutral-600 text-sm leading-relaxed">
                  Save time with live updates. Check trip status, driver ETAs, and progress on your
                  dashboard as the ride unfolds.
                </p>
              </div>
              <button
                type="button"
                className="mt-8 text-xs font-semibold text-black group-hover:underline flex items-center gap-1"
                onClick={(e) => handleNavClick(e, 'download')}
              >
                Get Started <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="bg-[#FAFAF7] rounded-2xl p-8 border border-neutral-100 flex flex-col justify-between items-center text-center shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
              <div className="space-y-6">
                <div className="h-44 flex items-center justify-center">
                  <img
                    src="/images/user/subscription.png"
                    alt="Subscription plans"
                    className="max-h-36 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <h3 className="text-xl font-bold text-black">Subscription & Benefits</h3>
                <p className="text-neutral-600 text-sm leading-relaxed">
                  Save more with monthly driver passes, loyalty perks, and priority booking when you
                  need a driver often.
                </p>
              </div>
              <button
                type="button"
                className="mt-8 text-xs font-semibold text-black group-hover:underline flex items-center gap-1"
                onClick={(e) => handleNavClick(e, 'download')}
              >
                Get Started <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="py-24 bg-[#FAFAF7] border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          <div className="lg:col-span-7 space-y-6 md:space-y-8">
            <div className="space-y-2">
              <span className="text-xs uppercase tracking-wider font-bold text-black bg-[#F5C400] px-3.5 py-1.5 rounded-full">
                About SpareDriver
              </span>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-black pt-2">
                Professional drivers, your car
              </h2>
            </div>

            <p className="text-neutral-600 text-sm md:text-base leading-relaxed">
              SpareDriver connects vetted chauffeurs with private car owners. Driving can be
              stressful, tiring, or a distraction from your day — hire a safe, expert driver and
              reclaim that time.
            </p>

            <p className="text-neutral-600 text-sm md:text-base leading-relaxed">
              Every driver goes through credential checks, driving tests, and background reviews. We
              keep the service clean, reliable, and straightforward.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <span className="text-sm font-semibold text-black">Simplicity</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <span className="text-sm font-semibold text-black">Convenience</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <span className="text-sm font-semibold text-black">Reliability</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-full max-w-sm rounded-3xl overflow-hidden bg-white border border-neutral-100 shadow-xl p-8 flex flex-col justify-center gap-8">
              <h4 className="text-lg font-bold text-black text-center border-b border-neutral-100 pb-4">
                Why users trust SpareDriver
              </h4>
              <ul className="space-y-4">
                <li className="flex gap-3.5">
                  <div className="w-6 h-6 rounded-full bg-[#F5C400] flex items-center justify-center shrink-0 text-black font-bold text-xs">
                    1
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-black">Strict Verification</h5>
                    <p className="text-xs text-neutral-600 mt-0.5">
                      Identity audits, license checks, and hands-on validation.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3.5">
                  <div className="w-6 h-6 rounded-full bg-[#F5C400] flex items-center justify-center shrink-0 text-black font-bold text-xs">
                    2
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-black">On-Time Guarantee</h5>
                    <p className="text-xs text-neutral-600 mt-0.5">
                      Drivers arrive at your scheduled time, tracked live.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3.5">
                  <div className="w-6 h-6 rounded-full bg-[#F5C400] flex items-center justify-center shrink-0 text-black font-bold text-xs">
                    3
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-black">24/7 Booking Support</h5>
                    <p className="text-xs text-neutral-600 mt-0.5">
                      Support monitors trips so you can ride with peace of mind.
                    </p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="download" className="py-24 bg-[#F5C400] relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10 space-y-8 animate-fade-in-up">
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-black leading-tight">
            Ready to travel stress-free?
          </h2>
          <p className="text-neutral-800 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            Get the SpareDriver app to book verified drivers, schedule round trips, and track every
            ride in real time.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-2">
            <Button
              variant="dark"
              size="xl"
              onClick={() => openStoreLink(siteConfig.androidAppUrl)}
              className="rounded-full font-bold px-8 hover:scale-[1.02] transition-transform duration-200 w-full sm:w-auto"
            >
              Download for Android
            </Button>
            <Button
              variant="outline"
              size="xl"
              onClick={() => openStoreLink(siteConfig.iosAppUrl)}
              className="rounded-full font-bold px-8 border-black/20 bg-white hover:scale-[1.02] transition-transform duration-200 w-full sm:w-auto"
            >
              Download for iOS
            </Button>
          </div>
        </div>
      </section>

      <section id="contact" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-black">Get in touch</h2>
            <div className="w-16 h-1.5 bg-[#F5C400] mx-auto rounded-full" />
            <p className="text-neutral-600 text-sm md:text-base">
              Have questions or need assistance? Our support team is here to help.
            </p>
          </div>

          <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-[#FAFAF7] border border-neutral-100 rounded-2xl p-6 text-center space-y-3 flex flex-col items-center">
              <div className="w-12 h-12 bg-[#F5C400] rounded-full flex items-center justify-center text-black">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-black text-base">Email Us</h3>
              <p className="text-xs text-neutral-500">For support and business inquiries</p>
              {siteConfig.supportEmail ? (
                <a
                  href={`mailto:${siteConfig.supportEmail}`}
                  className="text-sm font-semibold text-black hover:underline mt-2 break-all"
                >
                  {siteConfig.supportEmail}
                </a>
              ) : (
                <p className="text-sm text-neutral-500 mt-2">Coming soon</p>
              )}
            </div>

            <div className="bg-[#FAFAF7] border border-neutral-100 rounded-2xl p-6 text-center space-y-3 flex flex-col items-center">
              <div className="w-12 h-12 bg-[#F5C400] rounded-full flex items-center justify-center text-black">
                <Phone className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-black text-base">Call Support</h3>
              <p className="text-xs text-neutral-500">
                {siteConfig.supportHours || 'Support hours coming soon'}
              </p>
              {siteConfig.supportPhone ? (
                <a
                  href={`tel:${siteConfig.supportPhone}`}
                  className="text-sm font-semibold text-black hover:underline mt-2"
                >
                  {siteConfig.supportPhone}
                </a>
              ) : (
                <p className="text-sm text-neutral-500 mt-2">Coming soon</p>
              )}
            </div>

            <div className="bg-[#FAFAF7] border border-neutral-100 rounded-2xl p-6 text-center space-y-3 flex flex-col items-center">
              <div className="w-12 h-12 bg-[#F5C400] rounded-full flex items-center justify-center text-black">
                <MapPin className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-black text-base">Office</h3>
              <p className="text-xs text-neutral-500">Headquarters location</p>
              <p className="text-sm font-semibold text-black mt-2 whitespace-pre-wrap">
                {siteConfig.contactAddress || 'Coming soon'}
              </p>
            </div>
          </div>

          <div className="text-center mt-10">
            <Link to="/contact-us" className="text-sm font-semibold text-black hover:underline">
              View full contact page
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter socialUrls={siteConfig} />
    </div>
  );
};

export default LandingPage;
