import { useEffect } from 'react';
import { ArrowLeft, Mail, Shield, CheckCircle2 } from 'lucide-react';
import Button from '../../../components/Button';

const PrivacyPolicyPage = () => {
  // Set SEO Meta tags dynamically
  useEffect(() => {
    document.title = 'Privacy Policy - SpareDriver | Your Data Protection and Privacy Details';
    
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute(
      'content',
      'Read the SpareDriver Privacy Policy to understand how we collect, protect, and use your personal information, device data, location data, and user rights.'
    );
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="w-full min-h-screen bg-bg text-text antialiased font-sans flex flex-col justify-between">
      
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-dark/95 border-b border-dark-light/40 h-20 flex items-center">
        <div className="max-w-7xl mx-auto px-6 w-full flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 group">
            <img 
              src="/images/logo-white.png" 
              alt="SpareDriver Logo" 
              className="h-10 w-auto object-contain transition-transform duration-300 group-hover:scale-[1.02]"
            />
          </a>
          <a 
            href="/" 
            className="text-sm font-semibold text-text-muted hover:text-primary transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </a>
        </div>
      </header>

      {/* Main Document Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-16">
        
        {/* Document Header */}
        <div className="space-y-4 mb-12 border-b border-border pb-8">
          <div className="inline-flex p-3 bg-primary/10 rounded-2xl text-primary-dark mb-2">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-dark">
            Privacy Policy
          </h1>
          <p className="text-text-secondary text-sm">
            Last Updated: July 3, 2026
          </p>
        </div>

        {/* Policy Body */}
        <div className="space-y-10 text-text-secondary text-sm md:text-base leading-relaxed">
          
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-dark flex items-center gap-2">
              1. Introduction
            </h2>
            <p>
              At SpareDriver, we are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your personal information when you use our mobile application and website platforms. By accessing or using the platform, you consent to the collection and use of information as described herein.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-dark flex items-center gap-2">
              2. Information Collection
            </h2>
            <p>
              We collect information that you provide to us directly, device and network information, and trip-related details. This includes:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm mt-2">
              <li><strong>Personal Identifiers:</strong> Name, phone number, email address, profile picture, and car model registration numbers.</li>
              <li><strong>Location Data:</strong> Real-time geographical coordinates of your mobile device when using booking features, to trace routes, match drivers, and show live updates.</li>
              <li><strong>Financial Details:</strong> In-app wallet transactions, booking history, and details required to execute secure payments via Razorpay (we do not store raw card credentials).</li>
              <li><strong>Driver Log Files:</strong> Driving credentials, identity details, bank account validation, and verification video clips recorded for safety during sign-ups.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-dark flex items-center gap-2">
              3. Data Usage
            </h2>
            <p>
              Your information is processed to ensure service availability and continuous improvements. We use your data to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm mt-2">
              <li>Provide, operate, and maintain the on-demand driver assignment service.</li>
              <li>Establish real-time tracking, driver assignment routing, and distance billing metrics.</li>
              <li>Process transactions and issue invoices / booking receipts.</li>
              <li>Enhance passenger security, coordinate emergency (SOS) alerts, and execute background verification.</li>
              <li>Communicate service updates, notifications, and manage premium subscriptions.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-dark flex items-center gap-2">
              4. Cookies & Local Storage
            </h2>
            <p>
              We utilize cookies and secure local storage engines (session storage) to store active authenticated sessions, persistent user-onboarding checklist data, and dashboard layouts. You can configure your browser to reject cookies, but doing so may limit your ability to access active dashboard views.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-dark flex items-center gap-2">
              5. Data Security
            </h2>
            <p>
              We implement industry-standard technical and organizational security controls to protect personal data against unauthorized access, loss, or alteration. All APIs run over HTTPS (TLS encryption), database records are backed up securely, and cloud permissions are rigidly controlled. However, no digital transmission is 100% secure, and we cannot guarantee absolute absolute security.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-dark flex items-center gap-2">
              6. User Rights
            </h2>
            <p>
              You hold the right to manage your account details and request information retrieval. Specifically, you can:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm mt-2">
              <li>Access, correct, or update your name, email, and car profile details inside the Account tab.</li>
              <li>Deactivate or submit a permanent account deletion request (available through the Delete Account portal).</li>
              <li>Revoke device permissions for location tracking, microphone, or notifications via your device settings.</li>
            </ul>
          </section>

          <section className="space-y-4 bg-primary/5 p-6 rounded-2xl border border-primary/20">
            <h2 className="text-lg font-bold text-dark flex items-center gap-2">
              7. Contact Information
            </h2>
            <p className="text-sm">
              If you have any questions, concerns, or requests regarding this Privacy Policy, please write to us. Our data protection team will respond to your queries as soon as possible.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-2 text-xs font-semibold text-dark">
              <a href="mailto:privacy@sparedriver.com" className="flex items-center gap-2 hover:underline">
                <Mail className="w-4 h-4 text-primary-dark" />
                privacy@sparedriver.com
              </a>
              <span className="hidden sm:inline text-text-muted">|</span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Data Protection Officer
              </span>
            </div>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="bg-dark text-text-muted border-t border-dark-light/50 py-16 w-full">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-12 items-start">
          
          <div className="md:col-span-6 space-y-4">
            <img 
              src="/images/logo-white.png" 
              alt="SpareDriver Logo" 
              className="h-10 w-auto object-contain"
            />
            <p className="text-sm text-text-muted max-w-sm leading-relaxed">
              Reclaim your travel time. Hire premium, fully background-checked professional drivers to drive your own car, available on-demand.
            </p>
          </div>

          <div className="md:col-span-6 md:justify-self-end grid grid-cols-2 gap-12">
            <div className="space-y-4">
              <h4 className="text-xs uppercase font-bold text-white tracking-widest">Legal</h4>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <a href="/privacy-policy" className="hover:text-primary transition-colors">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="/terms-and-conditions" className="hover:text-primary transition-colors">
                    Terms & Conditions
                  </a>
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs uppercase font-bold text-white tracking-widest">Connect</h4>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <a href="/#contact" className="hover:text-primary transition-colors">
                    Contact Us
                  </a>
                </li>
              </ul>
            </div>
          </div>

        </div>

        <div className="max-w-7xl mx-auto px-6 pt-12 mt-12 border-t border-dark-light/40 flex flex-col sm:flex-row items-center justify-between text-xs text-text-muted gap-4">
          <p>© {new Date().getFullYear()} SpareDriver. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
};

export default PrivacyPolicyPage;
