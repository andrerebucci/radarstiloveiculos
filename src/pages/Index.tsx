import { Helmet } from 'react-helmet-async';
import { ApiKeyDialog } from '@/components/ApiKeyDialog';
import { MonitorForm } from '@/components/MonitorForm';
import { MonitorList } from '@/components/MonitorList';

const Index = () => {
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
            <div className="flex items-center justify-center gap-3">
              <ApiKeyDialog />
            </div>
          </header>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div>
              <MonitorForm />
            </div>
            <div className="hidden md:block" aria-hidden>
              <div className="h-full rounded-lg border bg-card/50 backdrop-blur-sm p-6">
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Adicione seu primeiro monitoramento ao lado para começar.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12">
            <MonitorList />
          </div>
        </div>
      </section>
    </main>
  );
};

export default Index;
