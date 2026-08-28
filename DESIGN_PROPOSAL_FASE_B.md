# Fase B - Proposta de Desenho: Menu de 3 Pontos e Modais de Edição/Exclusão

## 1. Campos Editáveis do Projeto (com Segurança)

Baseado em `bd config --help` e `bd --help`, os campos **editáveis com segurança após inicialização** de um projeto registrado são:

- **Nome do Projeto** (Project Label/Name) — Campo simples de texto, sem risco de conflito com IDs de beads
- **Caminho da Pasta** (Project Directory Path) — Seletor de folder, **essencial para recuperar projetos movidos/renomeados**
- **Prefixo** — ⚠️ **NÃO RECOMENDADO EDITAR** — O prefixo é embarcado em todos os IDs de beads. Mudar o prefixo após inicialização causaria quebra de referências. Deixar de fora do escopo da Edição.

Razão: `bd rename-prefix` existe no CLI e é uma operação **destrutiva** que recomputa todos os IDs — não é seguro expor via UI sem aviso explícito. Deixaremos este campo como read-only no modal.

## 2. Comportamento com Múltiplos Projetos Quebrados na Inicialização

**Decisão proposta**: Mostrar um modal por vez, em ordem sequencial (ordem de lista em `projects.json`).

Cada modal inclui:

- Título: `⚠️ Repair Project: {nome}`
- Descrição: "The project path is no longer valid. Please select a new location."
- Campo editável: **nome do projeto** + **seletor de pasta**
- Botão de ação: "Repair" (em vez de "Save")
- Botão de cancelar: "Cancel"

Após reparar um projeto:

- Validação da nova pasta acontece
- Se inválida: erro exibido no modal (manter o modal aberto para correção)
- Se válida: fechar modal e passar para o próximo projeto quebrado (se houver)
- Se o usuário cancelar: parar a sequência, permitir interagir com o dashboard

**Fluxo de código**:

- Hook `useValidateProjectsOnMount` mantém `currentBrokenIndex` e lista `brokenProjects`
- Cada vez que modal é fechado com sucesso, incrementa o índice e refetch da lista de projetos
- Se não há mais projetos quebrados, o estado volta a null e nenhum modal é exibido

## 3. Posicionamento Visual do Menu de 3 Pontos

### Rail de Projetos (project-rail.tsx)

**Desafio**: Rail é compacto (232px → 48px quando colapsado). Cada item de projeto é um link/botão já apertado.

**Solução proposta**:

- **Em modo expandido (232px)**:
  - Adicionar ícone de menu (⋮) ou (···) ALINHADO À DIREITA de cada projeto, revelado no **hover**
  - Layout: `[Ícone projeto] [Nome projeto] [Menu ⋮]` com gap/spacing adequado
  - Menu dropdown sobre o card do projeto, com opções:
    - "Editar" → Abre modal de edição
    - "Excluir" → Abre modal de confirmação
- **Em modo colapsado (48px)**:
  - Cada item é um ícone centrado
  - No **hover**, aparecer um tooltip + botão de menu (ou long-press em mobile)
  - Menu pode aparecer como **popover** ao lado do ícone

### Dashboard - Cards de Projeto (project-card.tsx)

**Layout atual**: Card com imagem/badge de projeto, nome, counts de status, etc.

**Solução proposta**:

- Adicionar ícone de menu (⋮) no **canto superior direito** do card, revelado no **hover**
- Menu dropdown com opções:
  - "Editar" → Abre modal de edição
  - "Excluir" → Abre modal de confirmação
- Não quebra o layout existente (card já tem espaço de canto superior)

### Modal de Confirmação de Exclusão

- Título: "Deletar Projeto: {nome}"
- Descrição: "Tem certeza que quer deletar este projeto do registro? A pasta não será deletada, mas o acesso ao projeto será removido da aplicação."
- Botões:
  - "Cancelar"
  - "Deletar" (variante destructive/red)

Após confirmação:

- Chamar `removeProject(id)`
- Refetch da lista de projetos
- Toast de sucesso: "Projeto removido"
- Se houver erro: Toast de erro com mensagem

## 4. Relação com Modal de "Copiar Configuração" (Fluxo Init de Novo Projeto)

**Estado atual**: Não há implementação de "copiar config de outro projeto" no fluxo de Init.

**Análise de reuso de componentes**:

- **Modal de Edição (Repair/Edit)**: Reutilizável, já que trata mudança de nome + pasta
- **Modal de Exclusão**: Específico para deletar, sem reuso imediato
- **Seletor de Pasta**: Componente reutilizável (`pickProjectDirectory()`)

**Relação**:

- Edição de projeto **existente** = mudar nome/pasta de algo que já foi inicializado
- Init de novo projeto = começar do zero, opcionalmente copiar config de um existente
- Essas são operações **distintas** em termos de fluxo de dados (renameMutation vs. initMutation), mas compartilham:
  - UI de seletor de pasta
  - Lógica de validação de path (`checkProjectPath`)
  - Tratamento de erro

**Recomendação**: Não compartilhar o modal `EditProjectModal` com o fluxo de Init. Mantê-los separados por clareza. Mas **extrair componentes de UI reutilizáveis**:

- `ProjectPathSelector` — Componente de seletor de pasta + validação
- `ProjectNameInput` — Componente de input de nome
- Usar esses componentes em ambos os modais

## 5. Cronograma de Implementação

### Fase B.1 (Backend Encanamento) — ✅ JÁ CONCLUÍDO

- ✅ `removeProject()` wrapper em `src/lib/server.ts`
- ✅ `checkProjectPath()` para validação
- ✅ `useValidateProjectsOnMount` hook
- ✅ EditProjectModal com prop `isRepair`

### Fase B.2 (UI de Menu 3-Pontos) — AGUARDANDO APROVAÇÃO

1. Adicionar ícone de menu (⋮) e popover no rail + cards
2. Implementar modal de confirmação de exclusão
3. Testar fluxos: repair, edit, delete
4. E2E tests para os novos fluxos

### Fase B.3 (Componentes Reutilizáveis) — OPCIONAL

1. Extrair `ProjectPathSelector` e `ProjectNameInput`
2. Usar em fluxo de Init quando for implementado "copiar config"

---

## Questões para Aprovação

1. **Ordem de projetos quebrados**: Usar ordem de `projects.json` (simples) ou adicionar lógica de "lastUsed"? (Proposta: simples, ordem atual)

2. **Campos editáveis**: Apenas nome + pasta, ou também permitir edição de outro campo? (Proposta: nome + pasta)

3. **Comportamento de cancelamento**: Se usuário cancelar repair de um projeto quebrado, deve voltar ao dashboard ou ficar no modal? (Proposta: voltar ao dashboard)

4. **Feedback visual**: Spinner/loading durante validação de novo path? (Proposta: sim, Loader2 como já feito em init)

---

**Pronto para implementação assim que tiver seu OK.**
