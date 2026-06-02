import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Clock, LogOut } from 'lucide-react';

export default function Pending({ email }: { email: string | null }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <Helmet><title>Aguardando aprovação — Car Watchdog</title></Helmet>
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <CardTitle>Acesso pendente</CardTitle>
          </div>
          <CardDescription>
            Sua conta ({email}) foi criada e está aguardando aprovação do administrador.
            Você receberá um e-mail assim que for liberado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
