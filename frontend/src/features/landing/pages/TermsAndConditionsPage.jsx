import { useEffect } from 'react';
import { ArrowLeft, Mail, FileText, CheckCircle2 } from 'lucide-react';
import Button from '../../../components/Button';

const TermsAndConditionsPage = () => {
  // Set SEO Meta tags dynamically
  useEffect(() => {
    document.title = 'Terms & Conditions - SpareDriver | User Agreement & Guidelines';
    
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute(
      'content',
      'Review the terms of service, user responsibilities, platform rules, account limitations, liability, and disclaimers for using SpareDriver chauffeur network.'
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
            <FileText className="w-6 h-6" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-dark">
            Terms & Conditions
          </h1>
          <p className="text-text-secondary text-sm">
            Last Updated: July 3, 2026
          </p>
        </div>

        {/* Terms Body */}
        <div className="space-y-10 text-text-secondary text-sm md:text-base leading-relaxed">
          
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-dark">
              1. Acceptance of Terms
            </h2>
            <p>
              By installing the SpareDriver mobile application, accessing our web platforms, or initiating driver booking requests, you agree to comply with and be bound by these Terms & Conditions. If you do not agree to these terms, you are prohibited from using the platform and must immediately de-register your account.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-dark">
              2. User Responsibilities
            </h2>
            <p>
              As a vehicle owner or customer booking driver services, you represent and warrant that:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm mt-2">
              <li>You own the vehicle or possess full legal authority to direct the driver to operate the vehicle.</li>
              <li>The vehicle contains active third-party motor insurance coverage, and is mechanically safe, certified, and compliant with all local transport laws.</li>
              <li>You will not instruct drivers to perform illegal tasks, exceed safe speed limits, or transport prohibited cargo / substances.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-dark">
              3. Service Usage Rules
            </h2>
            <p>
              SpareDriver acts as an intermediary platform matching drivers and car owners.
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm mt-2">
              <li>Bookings must be requested strictly through the official SpareDriver interface. Reaching out to matching drivers outside the app platform to bypass commissions is a direct violation of service guidelines.</li>
              <li>Cancellation fees may apply to bookings canceled after a driver has been dispatched or has arrived at your location.</li>
              <li>Tolls, parking costs, and state border permits are the direct responsibility of the customer and must be settled by the vehicle owner.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-dark">
              4. Account Limitations & Deactivation
            </h2>
            <p>
              We reserve the right to temporarily suspend or permanently terminate customer or driver access accounts without prior notification if we detect:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm mt-2">
              <li>Submission of false onboarding documentation (incorrect driving licenses, vehicle papers, or phone records).</li>
              <li>Inappropriate, abusive, or unprofessional behavior during booking interactions.</li>
              <li>Excessive payment defaults, unauthorized credit usage, or chargeback disputes.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-dark">
              5. Intellectual Property
            </h2>
            <p>
              All software code, visual assets, trademarks, application logos, structural mockups, and text materials displayed on the SpareDriver website and mobile application are the exclusive property of SpareDriver and its parent company. You may not copy, extract, reverse engineer, or hot-link any content without prior explicit written authorization.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-dark">
              6. Disclaimer of Warranties
            </h2>
            <p className="italic text-sm">
              The service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. SpareDriver makes no warranties, express or implied, including but not limited to the merchantability, reliability of matched drivers, safety of specific routes, or uninterrupted uptime of live tracking services.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-dark">
              7. Limitation of Liability
            </h2>
            <p>
              In no event shall SpareDriver, its affiliates, or its licensing partners be held liable for any direct, indirect, incidental, special, or consequential damages resulting from vehicle accidents, driver negligence, delay, loss of personal property, or physical injuries during a trip. The customer agrees to seek recourse directly from the third-party motor insurance provider or the driver personally.
            </p>
          </section>

          <section className="space-y-4 bg-primary/5 p-6 rounded-2xl border border-primary/20">
            <h2 className="text-lg font-bold text-dark flex items-center gap-2">
              8. Contact Support
            </h2>
            <p className="text-sm">
              For any clarification regarding these terms, payment reconciliation, or account disputes, please reach out to our legal and operations team:
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-2 text-xs font-semibold text-dark">
              <a href="mailto:legal@sparedriver.com" className="flex items-center gap-2 hover:underline">
                <Mail className="w-4 h-4 text-primary-dark" />
                legal@sparedriver.com
              </a>
              <span className="hidden sm:inline text-text-muted">|</span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Operations & Compliance Unit
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

export default TermsAndConditionsPage;
