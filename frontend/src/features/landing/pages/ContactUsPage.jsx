import { useEffect, useState } from 'react';
import { Mail, Phone, MapPin, Loader2, Clock } from 'lucide-react';
import api from '../../../utils/api';
import { LandingFooter, LandingHeader } from '../components/LandingShell';

const ContactUsPage = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Contact Us - SpareDriver';
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute(
      'content',
      'Contact SpareDriver support by phone, email, or visit our office address.',
    );
    window.scrollTo(0, 0);

    let cancelled = false;
    api
      .get('/common/support-config')
      .then((res) => {
        if (!cancelled) setConfig(res.data?.data || null);
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const phone = config?.supportPhone || '';
  const email = config?.supportEmail || '';
  const address = config?.contactAddress || '';
  const hours = config?.supportHours || '';

  return (
    <div className="w-full min-h-screen bg-bg text-text antialiased font-sans flex flex-col justify-between">
      <LandingHeader backToHome />

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-16">
        <div className="text-center max-w-2xl mx-auto mb-12 space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-dark">Contact Us</h1>
          <div className="w-16 h-1.5 bg-[#F5C400] mx-auto rounded-full" />
          <p className="text-text-secondary text-sm md:text-base">
            Have questions or need assistance? Reach our support team using the details below.
          </p>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-text-secondary">Loading contact details…</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-border-light rounded-2xl p-6 space-y-3">
              <div className="w-12 h-12 bg-[#F5C400] rounded-full flex items-center justify-center text-black">
                <Mail className="w-5 h-5" />
              </div>
              <h2 className="font-bold text-dark">Email</h2>
              {email ? (
                <a href={`mailto:${email}`} className="text-sm font-semibold text-black hover:underline break-all">
                  {email}
                </a>
              ) : (
                <p className="text-sm text-text-secondary">Not configured</p>
              )}
            </div>

            <div className="bg-white border border-border-light rounded-2xl p-6 space-y-3">
              <div className="w-12 h-12 bg-[#F5C400] rounded-full flex items-center justify-center text-black">
                <Phone className="w-5 h-5" />
              </div>
              <h2 className="font-bold text-dark">Phone</h2>
              {phone ? (
                <a href={`tel:${phone}`} className="text-sm font-semibold text-black hover:underline">
                  {phone}
                </a>
              ) : (
                <p className="text-sm text-text-secondary">Not configured</p>
              )}
            </div>

            <div className="bg-white border border-border-light rounded-2xl p-6 space-y-3">
              <div className="w-12 h-12 bg-[#F5C400] rounded-full flex items-center justify-center text-black">
                <MapPin className="w-5 h-5" />
              </div>
              <h2 className="font-bold text-dark">Address</h2>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">
                {address || 'Not configured'}
              </p>
            </div>

            <div className="bg-white border border-border-light rounded-2xl p-6 space-y-3">
              <div className="w-12 h-12 bg-[#F5C400] rounded-full flex items-center justify-center text-black">
                <Clock className="w-5 h-5" />
              </div>
              <h2 className="font-bold text-dark">Support Hours</h2>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">
                {hours || 'Not configured'}
              </p>
            </div>
          </div>
        )}
      </main>

      <LandingFooter />
    </div>
  );
};

export default ContactUsPage;
