import { Helmet } from 'react-helmet-async';
import { ApiKeyDialog } from '@/components/ApiKeyDialog';
import { MonitorForm } from '@/components/MonitorForm';
import MonitorList from '@/components/MonitorList';
import { BackupDialog } from '@/components/BackupDialog';
import { AuthButton } from '@/components/AuthButton';
import { useState, useEffect, useCallback } from 'react';
import { Monitor } from '@/types/monitor';
import { useAuth } from '@/hooks/useAuth';
import { DataService } from '@/services/DataService';
import { loadHistory } from '@/utils/history';
import { toast } from 'sonner';

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);

  // Load monitors - from cloud if logged in, otherwise from localStorage
  useEffect(() => {
    const loadMonitors = async () => {
      setLoading(true);

      if (user) {
        // Load from Supabase
        const cloudMonitors = await DataService.getMonitors(user.id);
        setMonitors(cloudMonitors);
      } else {
        // Load from localStorage
        const stored = localStorage.getItem('cw_monitors_v1');
        if (stored) {
          setMonitors(JSON.parse(stored));
        }
      }

      setLoading(false);
    };

    loadMonitors();

    // Listen for monitor updates
    const handleMonitorsUpdate = () => {
      loadMonitors();
    };

    window.addEventListener('cw_monitors_updated', handleMonitorsUpdate);
    return () => window.removeEventListener('cw_monitors_updated', handleMonitorsUpdate);
  }, [user]);

  const handleDeleteMonitor = async (id: string) => {
    const updatedMonitors = monitors.filter(monitor => monitor.id !== id);
    setMonitors(updatedMonitors);

    if (user) {
      const success = await DataService.deleteMonitor(id, user.id);
      if (!success) {
        toast.error('Erro ao deletar monitor');
        setMonitors(monitors); // Revert
        return;
      }
      await DataService.deleteListingsForMonitor(id, user.id);
    } else {
      localStorage.setItem('cw_monitors_v1', JSON.stringify(updatedMonitors));
    }

    window.dispatchEvent(new Event('cw_monitors_updated'));
    toast.success('Monitor removido');
  };

  const handleBackupRestore = useCallback((restoredMonitors: Monitor[], historyByMonitor: Record<string, any[]>) => {
    setMonitors(restoredMonitors);
    toast.success('Backup restaurado com sucesso');
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <Helmet>
        <title>Car Watchdog Brasil — Monitor de Precos de Veiculos Usados</title>
        <meta name="description" content="Monitore anuncios de carros usados no Brasil (OLX, Webmotors, Mercado Livre). Veja novos entrantes em uma tabela agregada." />
        <link rel="canonical" href={window.location.origin + '/'} />
        <meta property="og:title" content="Car Watchdog Brasil — Monitor de Precos" />
        <meta property="og:description" content="Acompanhe novos anuncios e precos de carros usados no Brasil em um so lugar." />
      </Helmet>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand/10 via-accent/30 to-background" />
        <div className="container py-16 md:py-24">
          <header className="text-center space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Car Watchdog Brasil</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Cole as URLs de busca de OLX, Webmotors e Mercado Livre. Nos rastreamos periodicamente e destacamos novos anuncios.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <ApiKeyDialog />
              <BackupDialog monitors={monitors} onRestore={handleBackupRestore} />
              <AuthButton />
            </div>
            {user && (
              <p className="text-xs text-muted-foreground">
                Sincronizando com a nuvem - seus dados estao salvos com seguranca.
              </p>
            )}
            {!user && !authLoading && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Dados salvos apenas localmente. Faca login para sincronizar na nuvem.
              </p>
            )}
          </header>

          {loading || authLoading ? (
            <div className="flex justify-center mt-10">
              <div className="animate-spin h-8 w-8 border-4 border-brand border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              <div className="mt-10">
                <MonitorForm userId={user?.id} onAdded={(monitor) => {
                  setMonitors(prev => [...prev, monitor]);
                }} />
              </div>

              <div className="mt-12">
                <MonitorList
                  monitors={monitors}
                  onDelete={handleDeleteMonitor}
                  userId={user?.id}
                />
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
};

export default Index;
