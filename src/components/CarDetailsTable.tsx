import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { ClientScraper } from '@/utils/ClientScraper';

interface CarDetail {
  url: string;
  title?: string;
  price?: string;
  year?: string;
  mileage?: string;
  location?: string;
  fuel?: string;
  transmission?: string;
}

interface CarDetailsTableProps {
  urls: string[];
}

export const CarDetailsTable = ({ urls }: CarDetailsTableProps) => {
  const { toast } = useToast();
  const [carDetails, setCarDetails] = useState<CarDetail[]>([]);
  const [loading, setLoading] = useState(false);

  const extractCarDetails = (html: string, url: string): CarDetail => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Webmotors specific selectors
    const title = doc.querySelector('h1')?.textContent?.trim() || 
                  doc.querySelector('[data-testid="vehicle-title"]')?.textContent?.trim() ||
                  doc.querySelector('.vehicle-title')?.textContent?.trim();
    
    const priceElement = doc.querySelector('[data-testid="price"]') || 
                        doc.querySelector('.price') ||
                        doc.querySelector('.valor') ||
                        doc.querySelector('[class*="price"]');
    const price = priceElement?.textContent?.match(/R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/)?.[0];
    
    // Extract year from URL or content
    const yearMatch = url.match(/\/(20\d{2}|19\d{2})(?:[-\/]|$)/) || 
                     html.match(/Ano[:\s]*(\d{4})/i) ||
                     html.match(/(\d{4})\s*\/\s*\d{4}/);
    const year = yearMatch?.[1];
    
    // Extract mileage
    const mileageMatch = html.match(/(\d{1,3}(?:\.\d{3})*)\s*km/i);
    const mileage = mileageMatch?.[1] ? `${mileageMatch[1]} km` : undefined;
    
    // Extract location
    const locationMatch = html.match(/([A-ZÁÊÕ][a-záêõ]+(?:\s+[A-ZÁÊÕ][a-záêõ]+)*)\s*[-–]\s*[A-Z]{2}/);
    const location = locationMatch?.[1];
    
    // Extract fuel type
    const fuelMatch = html.match(/(Flex|Gasolina|Álcool|Diesel|Elétrico|Híbrido)/i);
    const fuel = fuelMatch?.[1];
    
    // Extract transmission
    const transmissionMatch = html.match(/(Manual|Automático|Automatizado|CVT)/i);
    const transmission = transmissionMatch?.[1];

    return {
      url,
      title,
      price,
      year,
      mileage,
      location,
      fuel,
      transmission,
    };
  };

  const fetchCarDetails = async () => {
    if (urls.length === 0) {
      toast({ title: 'Nenhuma URL fornecida', variant: 'destructive' });
      return;
    }

    setLoading(true);
    const details: CarDetail[] = [];

    try {
      for (const url of urls) {
        try {
          const { html } = await ClientScraper.fetchHtml(url);
          const carDetail = extractCarDetails(html, url);
          details.push(carDetail);
        } catch (error) {
          console.error(`Erro ao buscar detalhes de ${url}:`, error);
          details.push({ url, title: 'Erro ao carregar' });
        }
      }

      setCarDetails(details);
      toast({ 
        title: 'Detalhes carregados', 
        description: `${details.length} carros analisados com sucesso.` 
      });
    } catch (error) {
      toast({ 
        title: 'Erro ao buscar detalhes', 
        description: 'Tente novamente em instantes.',
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Comparação Detalhada dos Carros</span>
          <Button 
            onClick={fetchCarDetails} 
            disabled={loading || urls.length === 0}
            variant="brand"
          >
            {loading ? 'Analisando...' : 'Buscar Detalhes'}
          </Button>
        </CardTitle>
        <CardDescription>
          {urls.length} URLs para análise detalhada
        </CardDescription>
      </CardHeader>
      <CardContent>
        {carDetails.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Ano</TableHead>
                  <TableHead>Quilometragem</TableHead>
                  <TableHead>Combustível</TableHead>
                  <TableHead>Câmbio</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Link</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carDetails.map((car, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">
                      {car.title || 'Título não encontrado'}
                    </TableCell>
                    <TableCell className="text-green-600 font-semibold">
                      {car.price || '-'}
                    </TableCell>
                    <TableCell>{car.year || '-'}</TableCell>
                    <TableCell>{car.mileage || '-'}</TableCell>
                    <TableCell>{car.fuel || '-'}</TableCell>
                    <TableCell>{car.transmission || '-'}</TableCell>
                    <TableCell>{car.location || '-'}</TableCell>
                    <TableCell>
                      <a 
                        href={car.url} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-primary underline-offset-4 hover:underline text-xs"
                      >
                        Ver anúncio
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">
            Clique em "Buscar Detalhes" para analisar os carros encontrados
          </p>
        )}
      </CardContent>
    </Card>
  );
};