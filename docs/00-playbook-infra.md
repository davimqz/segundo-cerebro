# Playbook – Infraestrutura do Segundo Cérebro

Oct 31, 2026 · @Davi Marques Oliveira

## Decisões tomadas

O segundo cérebro roda num VPS próprio, sempre ligado, para permitir integrações em tempo real (WhatsApp, Gmail, Telegram) com teto de R$ 100 por mês.

| Item | Escolha | Motivo |
| --- | --- | --- |
| Provedor | Hostinger | 8 GB de RAM, data center no Brasil e preço dentro do teto |
| Plano | KVM 2 (2 vCPU, 8 GB RAM, 100 GB NVMe) | 8 GB comporta n8n, PostgreSQL, Redis e os agentes com folga |
| Contrato | 24 meses, cupom de desconto extra | Menor custo mensal; a renovação sobe, conferir antes de fechar |
| Localização | Brasil | Menor latência para o Brasil e dados no país (LGPD) |
| Sistema | Ubuntu 26.04 LTS, versão limpa | Suporte até 2031 e suporte oficial do Docker |
| Adicionais | Só o scanner Monarx (gratuito) | Docker será instalado pelo repositório oficial, documentado |

Alternativas avaliadas: Contabo, Hetzner, Oracle Cloud (gratuito), AWS Lightsail, Vultr, Locaweb e Magalu Cloud.

Atenção: a moeda da conta Hostinger é definida pelo site em que ela foi criada e não pode ser alterada. Conta criada no hostinger.com cobra em dólar; no hostinger.com.br, em reais, com parcelamento e PIX.

## Conceitos

Para **entrar** no servidor usa-se a chave SSH; para **administrar** dentro dele, a senha do usuário.

| Credencial | Onde fica | Para que serve |
| --- | --- | --- |
| Chave privada (`id_ed25519`) | Só no computador do administrador | Prova a identidade ao entrar no servidor. Nunca é enviada a ninguém |
| Chave pública (`id_ed25519.pub`) | No servidor (`~/.ssh/authorized_keys`) | Funciona como cadeado que só a chave privada abre. Não é secreta |
| Passphrase | Gerenciador de senhas | Destrava a chave privada no computador. Protege a chave se o computador for roubado |
| Senha do usuário | Gerenciador de senhas | Usada pelo `sudo` para comandos de administrador. Não serve mais para entrar |
| Senha root | Gerenciador de senhas | Login root por SSH está bloqueado. Fica guardada para recuperação pelo terminal do painel do provedor |

Por que chave em vez de senha: robôs testam senhas em servidores o tempo todo; uma chave ed25519 é praticamente impossível de adivinhar e nada secreto trafega pela internet.

## Passo a passo executado

Ambiente: computador com Windows 11 (PowerShell, que já traz o OpenSSH). Substitua `<IP>` pelo IP do servidor e `davi` pelo usuário escolhido.

1. **Primeiro acesso como root** (PowerShell). Na primeira conexão, responder `yes` para confiar no servidor.

```powershell
ssh root@<IP>
```

2. **Atualizar o sistema** (no servidor). Se pedir reinício por novo kernel, rodar `reboot` e conectar de novo após 1 minuto.

```bash
apt update && apt upgrade -y
```

3. **Criar o usuário administrador** (no servidor). Campos de nome e telefone podem ficar em branco.

```bash
adduser davi
usermod -aG sudo davi
id davi
```

4. **Gerar a chave SSH** (PowerShell). Aceitar o local padrão e criar uma passphrase.

```powershell
ssh-keygen -t ed25519 -C "davi@asttralabs"
```

5. **Instalar a chave pública no servidor** (PowerShell). As aspas são necessárias se o nome de usuário do Windows tiver espaço.

```powershell
type "$env:USERPROFILE\.ssh\id_ed25519.pub" | ssh davi@<IP> "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

6. **Testar o acesso por chave** (PowerShell). Deve pedir a passphrase, não a senha do usuário.

```powershell
ssh davi@<IP>
```

7. **Bloquear login root e login por senha** (no servidor, como davi). O arquivo começa com `00-` para ter prioridade sobre configurações do provedor.

```bash
sudo tee /etc/ssh/sshd_config.d/00-hardening.conf > /dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
EOF
sudo sshd -t && sudo systemctl restart ssh
```

8. **Validar sem fechar a sessão atual** (novo PowerShell). `ssh davi@<IP>` deve entrar; `ssh root@<IP>` deve retornar `Permission denied (publickey)`.

9) **Firewall (UFW)** (no servidor). Libera só o SSH; os demais serviços passarão pela Cloudflare, sem portas abertas. Confirmar com `y` o aviso de conexão.

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status verbose
```

10. **Fail2ban** (no servidor). Bloqueia por 1 hora quem errar o acesso 5 vezes em 10 minutos.

```bash
sudo apt install -y fail2ban python3-systemd
sudo tee /etc/fail2ban/jail.local > /dev/null <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

11. **Atualizações de segurança automáticas** (no servidor). No Ubuntu 26.04 o pacote já vem instalado; conferir se as duas linhas do arquivo terminam com `"1";`.

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
cat /etc/apt/apt.conf.d/20auto-upgrades
```

12. **Docker pelo repositório oficial** (no servidor). O pacote é `docker-compose-plugin`, uma palavra só com hífens; um espaço no nome gera o erro "Package 'docker' has no installation candidate".

```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

13. **Limitar logs e usar Docker sem sudo** (no servidor). Sair e entrar de novo para o grupo valer.

```bash
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
sudo systemctl restart docker
sudo usermod -aG docker davi
exit
```

14. **Testar no servidor**, não no computador local: o prompt deve mostrar o nome do servidor antes de rodar.

```bash
docker run hello-world
```

**Regra de segurança do Docker:** portas publicadas por containers ignoram o UFW e ficam abertas para a internet. Todo serviço deve escutar só em `127.0.0.1` (por exemplo `127.0.0.1:5678:5678` no Compose) e ser acessado pela Cloudflare.

15. **Levantar o DNS atual** (no servidor). Mostra quem gerencia o DNS e para onde vai o e-mail. No caso da Asttra: DNS no Registro.br (`sec.dns.br`), e-mail na Hostinger, site na Vercel.

```bash
whois <dominio> | grep -i nserver
dig +short MX <dominio>
dig +short DS <dominio>
```

16. **Criar o domínio na Cloudflare** (plano Free) e comparar registro por registro com a zona atual. A importação automática deixou de fora 3 CNAMEs (`bio`, `rsend`, `send`), adicionados à mão.
17. **Deixar todos os registros existentes em DNS only** (nuvem cinza). Proxy ligado em registros da Vercel quebra o certificado do site; em DKIM e registros de envio de e-mail, quebra a autenticação. O aviso "not fully protected" da Cloudflare pode ser ignorado.
18. **Trocar os nameservers no registrador.** No Registro.br: domínio → Alterar servidores DNS → colar os dois nameservers reais da conta Cloudflare. Não preencher DNSSEC nesse momento; ele só é ativado depois, com os valores gerados pela Cloudflare.
19. **Validar após a propagação:** `whois` mostra os nameservers da Cloudflare, o site abre com e sem `www` e o e-mail envia e recebe.

### Cloudflare Tunnel e Access (executado em 31/10/2026)

20. **Confirmar o DNS ativo na Cloudflare.** O painel da Cloudflare mostra o domínio como ativo.
21. **Criar o tunnel** (painel da Cloudflare, Zero Trust → Networks → Tunnels). Nome: `vps-asttra`, tipo cloudflared com Docker. Copiar o token mostrado na tela; ele não vai para nenhum documento.
22. **Guardar o token no servidor** (no servidor, em `~/infra/cloudflared`). O token fica num `.env` com permissão `600` (só o dono lê e escreve). Ele foi digitado com `read -rp` e gravado no `.env`, porque o `nano` deu problema ao colar.
23. **Subir o tunnel com Docker Compose** (no servidor, em `~/infra/cloudflared`). O `compose.yml` usa `network_mode: host`, para o container alcançar os serviços em `localhost`, e lê o token do `.env`. Subir com `docker compose up -d` e conferir no painel que o tunnel aparece como saudável.
24. **Criar a rota de teste** (na tela do tunnel: Continue → Routes → Add route). `teste.asttralabs.com.br` → `http://localhost:8080`. A Cloudflare cria sozinha o registro DNS do subdomínio.
25. **Proteger com o Cloudflare Access** (Zero Trust → Access → Applications):
    - Aplicação: `Teste`, cobrindo `teste.asttralabs.com.br`.
    - Policy: `Só Davi`, ação Allow, regra por e-mail `davimqz2003@gmail.com`.
    - Login por código enviado no e-mail (One-time PIN).
    - Duração da sessão: 1 mês.
26. **Testar.** Ao abrir `teste.asttralabs.com.br`, a Cloudflare pede o e-mail, envia o código e, depois do código, abre a página de teste.

## Banco e backup

PostgreSQL 18 (um banco e um usuário por serviço: `painel`, `n8n` e `paperclip`) e Redis 8, em Docker, com backup diário criptografado no Cloudflare R2. Spec: [`specs/001-banco-e-backup.md`](specs/001-banco-e-backup.md). Decisão do backup: [ADR 0003](adr/0003-backup-com-restic-e-healthchecks.md).

Os arquivos ficam em `infra/banco/` neste repositório e são copiados para `/opt/asttra/banco/` no servidor. Os `.env` com senhas existem só no servidor, com permissão `600` e dono `root`. Por isso os comandos `docker compose` nessa pasta usam `sudo`.

Termos: **restic** é o programa de backup (criptografa, guarda só o que mudou e aplica a retenção); **R2** é o armazenamento de arquivos da Cloudflare (gratuito até 10 GB); **Healthchecks.io** é um serviço que manda e-mail quando o backup falha ou não avisa que rodou.

### Instalação (passo a passo)

27. **Criar o bucket e o token do R2** (navegador, painel da Cloudflare → R2). Criar o bucket `asttra-backups`. Em "Manage API tokens", criar um token com permissão "Object Read & Write" só nesse bucket. Guardar no gerenciador de senhas o Access Key ID, o Secret Access Key e o endpoint S3 (`https://<ID_DA_CONTA>.r2.cloudflarestorage.com`). Se a Cloudflare pedir um cartão para ativar o R2, o uso continua no plano gratuito.
28. **Criar a checagem no Healthchecks.io** (navegador). Conta gratuita (plano Hobby, sem cartão). Nova checagem `asttra-backup`, tipo "Simple", período de 1 dia, tolerância (grace) de 2 horas, fuso `America/Sao_Paulo`, aviso por e-mail. Guardar a URL de ping (`https://hc-ping.com/...`) no gerenciador de senhas.
29. **Criar a rede Docker compartilhada** (no servidor). Os próximos serviços (painel, n8n, Paperclip) entram nela para falar com o banco.

```bash
docker network create asttra
```

30. **Copiar os arquivos** (no Windows, PowerShell, na pasta do repositório). Troque `<alias>` pelo alias do servidor no `~/.ssh/config`.

```powershell
scp -r infra/banco <alias>:/tmp/banco
```

31. **Mover para `/opt/asttra/banco`** (no servidor).

```bash
sudo mkdir -p /opt/asttra
sudo mv /tmp/banco /opt/asttra/banco
sudo chown -R root:root /opt/asttra/banco
sudo chmod +x /opt/asttra/banco/init/*.sh /opt/asttra/banco/backup/*.sh
```

32. **Criar o `.env` do banco** (no servidor). As senhas são geradas na hora e não aparecem na tela. Os serviços vão ler daqui; para ver uma depois: `sudo cat /opt/asttra/banco/.env`.

```bash
cd /opt/asttra/banco
sudo install -m 600 -o root -g root /dev/null .env
for v in POSTGRES_PASSWORD PAINEL_DB_PASSWORD N8N_DB_PASSWORD PAPERCLIP_DB_PASSWORD REDIS_PASSWORD; do
  echo "$v=$(openssl rand -hex 32)"
done | sudo tee .env >/dev/null
sudo cut -d= -f1 .env
```

33. **Subir o banco e conferir** (no servidor). Os dois devem aparecer como `healthy`; a porta 5432 só em `127.0.0.1`; nenhuma porta 6379.

```bash
cd /opt/asttra/banco
sudo docker compose up -d --wait
sudo docker compose ps
sudo ss -tlnp | grep -E '5432|6379'
```

34. **Conferir o isolamento dos bancos e a senha do Redis** (no servidor). O primeiro `psql` deve mostrar `1`; o segundo deve dar "permission denied for database n8n"; o Redis sem senha deve responder `NOAUTH`.

```bash
cd /opt/asttra/banco
SENHA=$(sudo grep '^PAINEL_DB_PASSWORD=' .env | cut -d= -f2)
sudo docker compose exec -e PGPASSWORD="$SENHA" postgres psql -h 127.0.0.1 -U painel -d painel -Atc 'SELECT 1'
sudo docker compose exec -e PGPASSWORD="$SENHA" postgres psql -h 127.0.0.1 -U painel -d n8n -Atc 'SELECT 1'
unset SENHA
sudo docker compose exec redis redis-cli ping
```

35. **Instalar o restic** (no servidor).

```bash
sudo apt update && sudo apt install -y restic
restic version
```

36. **Criar o `backup.env`** (no servidor). A senha do restic é gerada e mostrada **uma vez**: copie para o gerenciador de senhas (item "VPS Asttra – senha do restic") antes de continuar. As chaves do R2 e a URL do Healthchecks.io são coladas sem aparecer na tela.

```bash
cd /opt/asttra/banco/backup
read -rp "ID da conta Cloudflare (do endpoint do R2): " CONTA
read -rsp "R2 Access Key ID: " AK; echo
read -rsp "R2 Secret Access Key: " SK; echo
read -rsp "URL de ping do Healthchecks.io: " HC; echo
RP=$(openssl rand -hex 32)
sudo install -m 600 -o root -g root /dev/null backup.env
printf 'RESTIC_REPOSITORY=s3:https://%s.r2.cloudflarestorage.com/asttra-backups\nRESTIC_PASSWORD=%s\nAWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\nHC_PING_URL=%s\n' \
  "$CONTA" "$RP" "$AK" "$SK" "$HC" | sudo tee backup.env >/dev/null
echo "Senha do restic (guarde agora): $RP"
unset CONTA AK SK HC RP
```

37. **Iniciar o repositório restic no R2** (no servidor). Só uma vez.

```bash
sudo bash -c 'set -a; . /opt/asttra/banco/backup/backup.env; restic init'
```

38. **Rodar o primeiro backup à mão** (no servidor). Deve terminar com "Backup concluído" e a checagem do Healthchecks.io fica verde.

```bash
sudo /opt/asttra/banco/backup/backup.sh
sudo bash -c 'set -a; . /opt/asttra/banco/backup/backup.env; restic snapshots'
```

39. **Instalar e ativar o timer** (no servidor). O backup passa a rodar todo dia às 03:00 de Brasília. Se o servidor estiver desligado nessa hora, roda quando ligar.

```bash
sudo cp /opt/asttra/banco/backup/asttra-backup.service /opt/asttra/banco/backup/asttra-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now asttra-backup.timer
systemctl list-timers asttra-backup.timer
sudo systemctl start asttra-backup.service
journalctl -u asttra-backup.service -n 30 --no-pager
```

40. **Testar a restauração** (no servidor). Restaura o último snapshot num banco separado (`restauracao_teste`), compara as linhas de cada tabela com o original e apaga o banco de teste. Deve terminar com "contagens iguais".

```bash
sudo /opt/asttra/banco/backup/restaurar.sh
```

41. **Testar o aviso de falha** (no servidor). Com o PostgreSQL parado, o backup deve falhar e o e-mail do Healthchecks.io deve chegar em poucos minutos. Depois, religar e rodar de novo para a checagem voltar ao verde.

```bash
cd /opt/asttra/banco
sudo docker compose stop postgres
sudo systemctl start asttra-backup.service; echo "código: $?"
sudo docker compose start postgres
sudo systemctl start asttra-backup.service
```

42. **Conectar pelo DBeaver** (no Windows, PowerShell). Abre um túnel SSH; enquanto ele estiver aberto, o DBeaver conecta em `localhost:5432`, banco `painel`, usuário `painel`.

```powershell
ssh -L 5432:127.0.0.1:5432 <alias>
```

### Atualizar os arquivos depois

Repita o passo 30 e, no servidor, copie por cima sem apagar os `.env`. Se mudou o `compose.yml`, recrie os containers; se mudou o timer, recarregue o systemd. O script `init/01-bancos.sh` só roda com o volume vazio: um banco novo depois disso é criado à mão.

```bash
sudo cp -r /tmp/banco/. /opt/asttra/banco/ && sudo rm -rf /tmp/banco
sudo chown -R root:root /opt/asttra/banco
cd /opt/asttra/banco && sudo docker compose up -d --wait
```

### Restauração manual mensal

Todo início de mês (lembrete no calendário), no servidor:
1. Rodar o passo 40 (`restaurar.sh`) e conferir "contagens iguais".
2. Conferir a lista de snapshots (`restic snapshots`, como no passo 38): deve haver até 7 diários e 4 semanais, o mais novo de hoje.
3. Conferir no painel do R2 que o bucket `asttra-backups` tem arquivos recentes.
4. Anotar a data do teste no Build Plan ou no diário de operação.

Para restaurar de verdade um banco perdido: `restic restore latest --host asttra-banco --tag banco --target /tmp/r`, depois `pg_restore` do arquivo `<banco>.dump` no banco recriado (com o serviço dele parado), e o `globals.sql` só se os usuários tiverem sumido.

### Se a senha do restic se perder

Sem a `RESTIC_PASSWORD`, os backups no R2 **não podem ser abertos por ninguém**: são criptografados e não há recuperação.
- Se o servidor ainda está de pé, a senha está em `/opt/asttra/banco/backup/backup.env`: copie de volta para o gerenciador de senhas.
- Se o servidor e o gerenciador se perderam juntos, os backups antigos estão perdidos. Com o servidor de pé, crie um repositório novo: apague os arquivos do bucket (com aprovação), gere nova senha (passo 36), rode `restic init` (passo 37) e um backup manual (passo 38).
- Para trocar a senha com segurança (por exemplo, se vazou): `restic key add` com a nova, atualizar o `backup.env` e o gerenciador, e depois `restic key remove` da antiga.

## Credenciais

Todas as credenciais ficam no gerenciador de senhas, com o mesmo padrão de nome e o IP do servidor anotado em cada item. Nenhum valor é registrado neste documento.

- **VPS Asttra – senha root**: manter guardada; serve para recuperação pelo terminal do navegador no painel da Hostinger.
- **VPS Asttra – senha usuário davi**: usada pelo `sudo`.
- **VPS Asttra – passphrase chave SSH**: destrava a chave privada.
- **Backup da chave privada** (`id_ed25519`): opcional, em gerenciador com suporte a chaves SSH (Bitwarden, 1Password). Nunca em e-mail, drive aberto ou chat.
- **VPS Asttra – senha do restic**: obrigatória. Sem ela nenhum backup pode ser restaurado.
- **Cloudflare R2 – token asttra-backups**: Access Key ID, Secret Access Key e endpoint.
- **Healthchecks.io – URL de ping**: a URL da checagem `asttra-backup`.
- As senhas do PostgreSQL e do Redis ficam só em `/opt/asttra/banco/.env` (geradas no servidor).

Se a chave for perdida, o acesso é recuperado pelo terminal do painel do provedor, instalando uma nova chave pública.

## Erros comuns

| Sintoma | Causa | Solução |
| --- | --- | --- |
| `adduser` repete "Waiting for lock to become available" | Ctrl+Z pausou o comando anterior, que segura a trava | Ctrl+C, depois `fg` para retomar e concluir o comando pausado |
| `Cannot find path ...id_ed25519.pub` | A chave ainda não foi gerada | Rodar `ssh-keygen` antes de instalar a chave |
| Caminho com espaço quebra o comando no PowerShell | Nome de usuário do Windows tem espaço | Colocar o caminho entre aspas |
| Senha esquecida do usuário | Não foi salva no gerenciador | Como root ou com `sudo`: `passwd davi` |
| `cls` não funciona no servidor | Comando do Windows | No Linux, usar `clear` |
| Senha não aparece ao digitar | Comportamento padrão do terminal | Digitar ou colar normalmente e apertar Enter |
| `docker compose` em `/opt/asttra/banco` dá "permission denied" no `.env` | O `.env` é do root, com permissão `600` | Rodar com `sudo docker compose ...` |
| `network asttra declared as external, but could not be found` | A rede Docker compartilhada não existe | `docker network create asttra` (passo 29) |
| Mudei a senha no `.env` e o usuário do banco continua com a antiga | O `init/01-bancos.sh` só roda com o volume vazio | Trocar também no banco: `ALTER ROLE <usuario> PASSWORD '...'` pelo `psql` como `postgres` |
| O subdomínio do tunnel não abre (DNS não existe) | A rota não foi criada na tela de criação do tunnel | Na tela de criação do tunnel, clicar em Continue e criar a rota em Routes > Add route; sem isso o DNS do subdomínio não existe |

## Próximos passos

- [x] Acesso por chave SSH com usuário administrador
- [x] Login root e login por senha bloqueados
- [x] Firewall (UFW) liberando só o SSH
- [x] Fail2ban contra tentativas repetidas de acesso
- [x] Atualizações de segurança automáticas
- [x] Docker pelo repositório oficial
- [x] Cloudflare na frente dos serviços, sem portas abertas (Tunnel e Access)
- [ ] Rotina de backup (Etapa 1, item 2: ver "Banco e backup", passos 27 a 42)
