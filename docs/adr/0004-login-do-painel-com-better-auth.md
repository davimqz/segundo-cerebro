# 0004. Login do painel com Better Auth e argon2id

- Status: Aceito
- Data: 2026-11-02
- Decidido por: Davi

## Contexto
O painel tem um login próprio com e-mail e senha, a segunda camada depois do Cloudflare Access (spec 002). Esse login precisa de:
- hash de senha forte;
- limite de tentativas;
- sessão no servidor que possa ser encerrada no logout e na troca de senha;
- cookie seguro e nenhum cadastro público.

Também precisa usar a stack decidida (Next.js, PostgreSQL e Drizzle), ter licença que permita implantar no servidor de um cliente e não ter custo.

## Decisão
O login usa o **Better Auth** (MIT), com:
- as sessões no PostgreSQL pelo adaptador do Drizzle;
- o cadastro desligado (`disableSignUp`);
- o limite de tentativas guardado no banco;
- o hash trocado para **argon2id** com o `@node-rs/argon2` (MIT), no lugar do scrypt padrão, para seguir o checklist de segurança.

## Alternativas consideradas
- **Auth.js (NextAuth):** o próprio projeto desaconselha o login por e-mail e senha. A sessão fica em JWT, difícil de encerrar no servidor, e o limite de tentativas teria de ser escrito à parte.
- **Implementação própria** (argon2, tabela de sessões e cookie): menos uma dependência, mas mais código de segurança para escrever, testar e manter, que é justamente onde um erro custa mais.
- **Serviços prontos (Clerk, Auth0):** dados de login fora do servidor, custo acima do plano gratuito e dependência externa ao replicar para clientes.

## Consequências
- Login, sessão, limite de tentativas e troca de senha vêm prontos e testados pela comunidade, e sobra menos código próprio para revisar.
- O Better Auth cria as próprias tabelas de login no banco `painel`, e as atualizações dele podem trazer migrações. Cada atualização passa pelo Dependabot e pelos testes de integração do login.
- Papéis, mais de um usuário e verificação em duas etapas, quando entrarem, podem usar os plugins do próprio Better Auth.
- **Gatilho para rever:** o projeto deixa de ser mantido, muda de licença, ou surge uma falha de segurança sem correção em tempo razoável.
