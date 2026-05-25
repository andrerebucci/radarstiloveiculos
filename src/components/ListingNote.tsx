import { useEffect, useState } from 'react';
import { Pencil, StickyNote } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { getNote, setNote } from '../utils/notes';
import type { SiteKey } from '../types/monitor';
import { toast } from 'sonner';

interface Props {
  url: string;
  site: SiteKey;
}

export function ListingNote({ url, site }: Props) {
  const [note, setNoteState] = useState<string>('');
  const [draft, setDraft] = useState<string>('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const refresh = () => setNoteState(getNote(url, site));
    refresh();
    window.addEventListener('cw_notes_updated', refresh);
    return () => window.removeEventListener('cw_notes_updated', refresh);
  }, [url, site]);

  const handleSave = () => {
    setNote(url, site, draft);
    setNoteState(draft);
    setOpen(false);
    toast.success(draft.trim() ? 'Observação salva' : 'Observação removida');
  };

  const hasNote = !!note.trim();

  return (
    <div className="inline-flex items-center gap-1">
      {hasNote && (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <StickyNote className="h-3.5 w-3.5 text-amber-500 cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs whitespace-pre-wrap text-xs">
              {note}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(note); }}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-primary" title="Adicionar observação">
            <Pencil className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-2">
            <p className="text-sm font-medium">Observação</p>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ex.: motor com ruído, batido, longe demais..."
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleSave}>Salvar</Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
