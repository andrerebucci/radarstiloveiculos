
Vou implementar as 4 features em ordem de complexidade. Como envolve banco, autenticação, e-mails e edge functions, faço em **2 entregas** para você validar entre uma e outra.

---

## Entrega 1 — Backbone (Firecrawl backup + Organização + Aprovação no app)

### 1. Firecrawl com chave reserva (failover automático)
- Adiciono um secret novo `FIRECRAWL_API_KEY_BACKUP` (opcional).
- Na edge function `scrape-url`, se a chave 1 falhar (402 / 429 / 5xx / sem créditos), tenta a chave 2 automaticamente.
- Log indicando qual chave foi usada (visível no painel de debug).

### 2. Organização (código fixo criado pelo dono)
- Novas tabelas:
  - `organizations` (id, code único legível ex `ORG-AB12CD`, name, owner_user_id)
  - `organization_members` (org_id, user_id, role: owner/member)
- `monitors` ganha `organization_id` (nullable) e `shared` (boolean).
- RLS: usuário enxerga monitor se for dono **ou** se o monitor for `shared=true` e usuário for membro da organização do monitor.
- UI:
  - Tela "Minha Organização": criar org (gera código), entrar em org (cola código), listar membros, sair, dono pode remover membro.
  - No formulário "Adicionar Monitoramento": toggle "Compartilhar com a organização".
  - Badge "Compartilhado" nos cards de monitor.

### 3. Aprovação de novos usuários (parte no app — e-mail entra na Entrega 2)
- Novas tabelas:
  - `profiles` (user_id, email, full_name, status: pending/approved/rejected, created_at)
  - `user_roles` (user_id, role: admin/user) — você vira admin manualmente via migration.
- Trigger no signup: cria profile com status `pending`.
- Bloqueio: usuários `pending` veem tela "Aguardando aprovação" e não conseguem usar o app.
- Painel admin (rota `/admin`, visível só para role admin): lista pendentes, botões Aprovar/Recusar.

---

## Entrega 2 — E-mails (após Entrega 1 validada)

> Requer configurar um domínio de envio. Vou abrir o diálogo de setup quando chegar a hora.

### 3b. E-mail de aprovação
- Quando alguém faz signup, dispara e-mail para o(s) admin(s) com link direto: "Aprovar [Nome] (email)" → abre `/admin`.
- Quando o admin aprova/recusa, dispara e-mail para o usuário avisando o resultado.

### 4. Notificações de novos anúncios
- Nova tabela `notification_preferences` (user_id, email_on_new_listing: bool, default true).
- UI nas configurações do usuário (na AuthBar): toggle "Receber e-mail quando aparecer anúncio novo".
- Após cada verificação de monitoramento (já existente), comparar com histórico — para cada anúncio realmente novo, enfileirar e-mail para o dono (e para membros da org, se compartilhado e com preferência ativa).
- E-mail agrupa novos anúncios da mesma rodada (1 e-mail por monitoramento por verificação, não 1 por anúncio).

---

## Detalhes técnicos relevantes

- Migrations Supabase com RLS apertada em todas as novas tabelas (`organizations`, `organization_members`, `profiles`, `user_roles`, `notification_preferences`).
- `has_role()` como SECURITY DEFINER para evitar recursão de RLS no painel admin.
- `cloudSync.ts` atualizado para incluir monitores compartilhados na sincronização.
- E-mails usam Lovable Emails (fila, retry, log) — sem chave de terceiros.
- Detecção de "novo anúncio" feita server-side numa edge function agendada (`pg_cron` a cada hora) para não depender do navegador aberto.

---

## Sugestão de ordem

Posso começar agora pela **Entrega 1** completa (Firecrawl backup + Organização + Aprovação no painel). Depois que validar, faço a **Entrega 2** (e-mails). Confirma?
