import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ApiKeyDialog } from '@/components/ApiKeyDialog';
import { AuthBar } from '@/components/AuthBar';
import { MonitorForm } from '@/components/MonitorForm';
import MonitorList from '@/components/MonitorList';
import { useState, useEffect } from 'react';
import { Monitor } from '@/types/monitor';
import { useUserProfile } from '@/hooks/useUserProfile';
import Pending from './Pending';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';

const Index = () => {
  const { profile, loading } = useUserProfile();
  const [monitors, setMonitors] = useState<Monitor[]>([]);

  // Load monitors from localStorage on mount
  useEffect(() => {
    const loadMonitors = () => {
      const stored = localStorage.getItem('cw_monitors_v1');
      if (stored) {
        setMonitors(JSON.parse(stored));
      }
    };

    loadMonitors();

    // Listen for monitor updates
    const handleMonitorsUpdate = () => {
      loadMonitors();
    };

    window.addEventListener('cw_monitors_updated', handleMonitorsUpdate);
    return () => window.removeEventListener('cw_monitors_updated', handleMonitorsUpdate);
  }, []);

  const handleDeleteMonitor = (id: string) => {
    const updatedMonitors = monitors.filter(monitor => monitor.id !== id);
    setMonitors(updatedMonitors);
    localStorage.setItem('cw_monitors_v1', JSON.stringify(updatedMonitors));
  };
  if (profile && profile.status === 'pending') return <Pending email={profile.email} />;
  if (profile && profile.status === 'rejected') return <Pending email={profile.email} />;

  return (
    <main className="min-h-screen bg-background">
      <Helmet>
        <title>Car Watchdog Brasil — Monitor de Preços de Veículos Usados</title>
        <meta name="description" content="Monitore anúncios de carros usados no Brasil (OLX, Webmotors, Mercado Livre). Veja novos entrantes em uma tabela agregada." />
        <link rel="canonical" href={window.location.origin + '/'} />
        <meta property="og:title" content="Car Watchdog Brasil — Monitor de Preços" />
        <meta property="og:description" content="Acompanhe novos anúncios e preços de carros usados no Brasil em um só lugar." />
      </Helmet>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand/10 via-accent/30 to-background" />
        <div className="container py-16 md:py-24">
          <header className="text-center space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Car Watchdog Brasil</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Cole as URLs de busca de OLX, Webmotors e Mercado Livre. Nós rastreamos periodicamente e destacamos novos anúncios.
            </p>
            <div className="flex flex-col items-center justify-center gap-3">
              <ApiKeyDialog />
              <AuthBar />
              {profile?.isAdmin && (
                <div className="flex gap-2 flex-wrap justify-center">
                  <Button asChild variant="outline" size="sm"><Link to="/admin"><Shield className="h-4 w-4 mr-1" /> Painel Admin</Link></Button>
                </div>
              )}
            </div>
          </header>

          <div className="mt-10">
            <MonitorForm />
          </div>

          <div className="mt-12">
            <MonitorList monitors={monitors} onDelete={handleDeleteMonitor} />
          </div>
        </div>
      </section>
    </main>
  );
};

export default Index;
