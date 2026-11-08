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

### Instalação (executada em 02/11/2026)

Antes de começar:
- **Acesso ao servidor:** `<servidor>` nos comandos é `davi@<IP>`, ou o alias, se houver um no `~/.ssh/config` do Windows. Sem alias, o IP fica no painel da Hostinger (VPS → visão geral) e deve ser anotado no item "VPS Asttra" do gerenciador de senhas.
- **Colar no terminal:** use o **botão direito do mouse** (ou Ctrl+Shift+V no Windows Terminal). O Ctrl+V não cola: ele manda um caractere invisível, e um `read -s` recebe 0 ou 1 caractere sem avisar.
- **Um comando por vez:** colar vários blocos juntos pode embaralhar a ordem (aparecem `^[[200~` na tela) ou rodar os comandos fora de ordem.
- **Salvar só os valores** no gerenciador de senhas, sem rótulos como `Key=` ou "Senha:". Um rótulo grudado vai junto na colagem e quebra a chave.

27. **Criar o bucket e o token do R2** (navegador, painel da Cloudflare → R2).
    - Criar o bucket `asttra-backups`, na jurisdição padrão (sem `.eu.` no endereço).
    - Em "Manage API tokens", escolher **Create Account API token** (pertence à conta, não ao usuário). Nome `asttra-backups-restic`, permissão **Object Read & Write**, "Apply to specific buckets only" → `asttra-backups`, TTL Forever, sem filtro de IP.
    - A tela final mostra três valores. O backup usa só dois: o **Access Key ID** (32 caracteres) e o **Secret Access Key** (64 caracteres, só aparece nessa tela). O "Token value" não é usado.
    - Guardar os dois no gerenciador, mais o **ID da conta**: os 32 caracteres logo depois de `dash.cloudflare.com/` na barra de endereço, ou o "Account ID" na página do R2. **O ID da conta não é o Access Key ID**, embora os dois tenham 32 caracteres.
    - Se a Cloudflare pedir um cartão para ativar o R2, o uso continua no plano gratuito.
28. **Criar a checagem no Healthchecks.io** (navegador). Conta gratuita (plano Hobby, sem cartão). **Add Check** → nome `asttra-backup`, tipo "Simple", período (Period) de 1 dia, tolerância (Grace) de 2 horas, aviso por e-mail ligado. A **URL de ping** (`https://hc-ping.com/<código>`) aparece ao clicar na checagem; é o endereço que o script chama para avisar início, sucesso e falha. Guardar no gerenciador: quem tem a URL pode mandar avisos falsos.
29. **Criar a rede Docker compartilhada** (no servidor). Os próximos serviços (painel, n8n, Paperclip) entram nela para falar com o banco.

```bash
docker network create asttra
```

30. **Copiar os arquivos** (no Windows, PowerShell). Primeiro entrar na pasta do repositório e atualizar a `main`; só depois o `scp`, senão ele não acha `infra/banco`.

```powershell
cd "C:\Users\Davi Oliveira\Asttra-Labs\segundo-cerebro"
git checkout main
git pull
scp -r infra/banco <servidor>:/tmp/banco
```

31. **Mover para `/opt/asttra/banco` e acertar as permissões** (no servidor). O `scp` do Windows cria a pasta só com acesso para o dono; depois do `chown root`, o PostgreSQL (que roda como outro usuário no container) não conseguiria ler o `init/`. Por isso as permissões são definidas com `find` e `sudo` (um `*.sh` sem sudo não funciona: quem expande o `*` é o shell do davi, que não lê a pasta).

```bash
sudo mkdir -p /opt/asttra
sudo mv /tmp/banco /opt/asttra/banco
sudo chown -R root:root /opt/asttra/banco
sudo find /opt/asttra/banco -type d -exec chmod 755 {} +
sudo find /opt/asttra/banco -type f -exec chmod 644 {} +
sudo find /opt/asttra/banco -name '*.sh' -exec chmod 755 {} +
sudo ls -laR /opt/asttra/banco
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

33. **Subir o banco e conferir** (no servidor). Os dois devem aparecer como `healthy`; a porta 5432 só em `127.0.0.1`; nenhuma porta 6379 no `ss`. No `ps`, o Redis aparece como `6379/tcp` sem `->`: a porta existe só dentro da rede Docker, sem publicação no servidor.

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

36. **Criar o `backup.env`** (no servidor). As chaves do R2 e a URL do Healthchecks.io são coladas (botão direito) sem aparecer na tela; cada `read` mostra em seguida quantos caracteres recebeu, para conferir na hora. Rode um comando por vez.

```bash
cd /opt/asttra/banco/backup
read -rp "ID da conta Cloudflare: " CONTA; echo "-> ${#CONTA} caracteres (esperado 32)"
read -rsp "R2 Access Key ID: " AK; echo " -> ${#AK} caracteres (esperado 32)"
read -rsp "R2 Secret Access Key: " SK; echo " -> ${#SK} caracteres (esperado 64)"
read -rsp "URL de ping do Healthchecks.io: " HC; echo " -> ${#HC} caracteres (esperado mais de 30)"
[[ $CONTA =~ ^[0-9a-f]{32}$ && $AK =~ ^[0-9a-f]{32}$ && $SK =~ ^[0-9a-f]{64}$ && $AK != "$CONTA" ]] && echo "formato ok" || echo "ERRO: repita o read do valor errado"
```

Só com "formato ok", gere a senha do restic e grave o arquivo. A senha aparece **uma vez**: copie só o valor para o gerenciador de senhas (item "VPS Asttra – senha do restic") antes de continuar.

```bash
RP=$(openssl rand -hex 32)
sudo install -m 600 -o root -g root /dev/null backup.env
printf 'RESTIC_REPOSITORY=s3:https://%s.r2.cloudflarestorage.com/asttra-backups\nRESTIC_PASSWORD=%s\nAWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\nHC_PING_URL=%s\n' "$CONTA" "$RP" "$AK" "$SK" "$HC" | sudo tee backup.env >/dev/null
echo "Senha do restic (guarde agora): $RP"
unset CONTA AK SK HC RP; sudo cut -d= -f1 backup.env; ls -la backup.env
```

Antes do `restic init`, testar se o R2 aceita as chaves (troque `<ID_DA_CONTA>`). As credenciais vão para o `curl` pela entrada padrão (`-K -`), para não aparecerem na lista de processos. O esperado é uma resposta começando com `<ListBucketResult`; `Unauthorized` quer dizer chave errada ou token sem acesso ao bucket (ver "Trocar as chaves do R2", abaixo).

```bash
sudo bash -c 'set -a; . /opt/asttra/banco/backup/backup.env; printf "user = \"%s:%s\"\n" "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" | curl -s -K - --aws-sigv4 "aws:amz:auto:s3" "https://<ID_DA_CONTA>.r2.cloudflarestorage.com/asttra-backups?list-type=2&max-keys=1"; echo'
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

39. **Instalar e ativar o timer** (no servidor). O backup passa a rodar todo dia às 03:00 de Brasília. Se o servidor estiver desligado nessa hora, roda quando ligar. O servidor está em UTC, então o `list-timers` mostra **06:00 UTC**. O `journalctl` precisa de `sudo`; sem ele, aparece "No entries".

```bash
sudo cp /opt/asttra/banco/backup/asttra-backup.service /opt/asttra/banco/backup/asttra-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now asttra-backup.timer
systemctl list-timers asttra-backup.timer
sudo systemctl start asttra-backup.service
sudo journalctl -u asttra-backup.service -n 30 --no-pager
```

Enquanto houver menos de 7 dias de cópias, o restic guarda também a mais antiga ("oldest daily snapshot"), então dois backups no mesmo dia ficam os dois. A partir do 8º dia, sobra uma por dia.

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

42. **Conectar pelo DBeaver** (no Windows, PowerShell; opcional). Abre um túnel SSH, que precisa ficar aberto enquanto o DBeaver estiver em uso.

```powershell
ssh -L 5432:127.0.0.1:5432 <servidor>
```

No DBeaver: Nova conexão (ícone de tomada com +) → PostgreSQL → Host `localhost`, Port `5432`, Database `painel`, Username `painel`. A senha é o valor depois do `=` em `sudo grep PAINEL_DB_PASSWORD /opt/asttra/banco/.env` (no servidor; o sudo pede a senha do usuário davi). Não precisa ir para o gerenciador: ela fica no `.env` e o DBeaver pode lembrar ("Save password").

### Trocar as chaves do R2

Para trocar o token (chave errada, vazada ou revogada) sem refazer o `backup.env`: criar o token novo como no passo 27 e, no servidor, rodar a linha abaixo. Ela pede as duas chaves, mostra o tamanho recebido e só grava se o formato estiver certo; a senha do restic e a URL de ping continuam iguais. Depois, repetir o teste do `curl` do passo 36 e apagar o token antigo na Cloudflare e no gerenciador.

```bash
sudo bash -c 'umask 077; f=/opt/asttra/banco/backup/backup.env; read -rsp "Novo Access Key ID: " AK; echo " -> recebi ${#AK} caracteres (esperado 32)"; read -rsp "Novo Secret Access Key: " SK; echo " -> recebi ${#SK} caracteres (esperado 64)"; [[ $AK =~ ^[0-9a-f]{32}$ && $SK =~ ^[0-9a-f]{64}$ ]] || { echo "Formato errado, nada foi alterado."; exit 1; }; grep -vE "^AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)=" "$f" > "$f.novo"; printf "AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\n" "$AK" "$SK" >> "$f.novo"; mv "$f.novo" "$f"; echo "Chaves trocadas."'
```

### Atualizar os arquivos depois

Repita o passo 30 e, no servidor, copie por cima sem apagar os `.env`. Se mudou o `compose.yml`, recrie os containers; se mudou o timer, recarregue o systemd. O script `init/01-bancos.sh` só roda com o volume vazio: um banco novo depois disso é criado à mão.

```bash
sudo cp -r /tmp/banco/. /opt/asttra/banco/ && sudo rm -rf /tmp/banco
sudo chown -R root:root /opt/asttra/banco
sudo find /opt/asttra/banco -type d -exec chmod 755 {} +
sudo find /opt/asttra/banco -type f ! -name '*.env' ! -name '.env' -exec chmod 644 {} +
sudo find /opt/asttra/banco -name '*.sh' -exec chmod 755 {} +
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

## Painel

O app do painel (Next.js) roda num container no servidor, atrás do Cloudflare Tunnel e do Cloudflare Access, com login próprio por e-mail e senha. Spec: [`specs/002-painel-nucleo.md`](specs/002-painel-nucleo.md). Decisões: [ADR 0004](adr/0004-login-do-painel-com-better-auth.md) (login com Better Auth) e [ADR 0005](adr/0005-imagem-do-painel-construida-no-servidor.md) (imagem construída no servidor).

O código fica em `painel/` e a implantação em `infra/painel/` neste repositório. No servidor:
- `/opt/asttra/painel-src`: cópia do repositório, atualizada com `git pull` por uma **chave de deploy** (chave SSH que só lê este repositório no GitHub);
- `/opt/asttra/painel`: cópia de `infra/painel/`, com o `.env` (permissão `600`, dono `root`).

O container escuta só em `127.0.0.1:18000`, roda as migrações do banco antes de abrir e responde em `/api/saude` para o healthcheck. O sistema de arquivos do container é só de leitura.

### Instalação (executada em 2026-11-02)

43. **Conferir que a porta está livre** (no servidor). Não deve aparecer nada.

```bash
ss -tlnp | grep ':18000'
```

44. **Criar a chave de deploy** (no servidor, como davi). Ela não tem senha porque o `git pull` roda sem ninguém digitar; por isso só tem leitura e só neste repositório.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/painel-deploy -N "" -C "painel-deploy@vps-asttra"
printf 'Host github-painel\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/painel-deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
chmod 600 ~/.ssh/config
cat ~/.ssh/painel-deploy.pub
```

45. **Cadastrar a chave no GitHub** (navegador). Repositório `davimqz/segundo-cerebro` → Settings → Deploy keys → Add deploy key. Título `vps-asttra`, colar a linha do `cat` acima e **deixar desmarcado** "Allow write access".
46. **Clonar o repositório** (no servidor). Na primeira conexão, o SSH pergunta se confia no GitHub: confira se a impressão digital é `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU` (a chave ED25519 publicada pelo GitHub) e responda `yes`.

```bash
sudo mkdir -p /opt/asttra/painel-src
sudo chown davi:davi /opt/asttra/painel-src
git clone git@github-painel:davimqz/segundo-cerebro.git /opt/asttra/painel-src
```

47. **Copiar a implantação para `/opt/asttra/painel`** (no servidor).

```bash
sudo cp -r /opt/asttra/painel-src/infra/painel /opt/asttra/painel
sudo chown -R root:root /opt/asttra/painel
```

48. **Criar o `.env` do painel** (no servidor). O segredo das sessões é gerado na hora e a senha do banco vem do `.env` do banco; nada aparece na tela. O último comando mostra só os nomes das variáveis.

```bash
cd /opt/asttra/painel
sudo install -m 600 -o root -g root /dev/null .env
sudo bash -c 'S=$(grep "^PAINEL_DB_PASSWORD=" /opt/asttra/banco/.env | cut -d= -f2-); cat > /opt/asttra/painel/.env <<EOF
DATABASE_URL=postgres://painel:$S@postgres:5432/painel
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
BETTER_AUTH_URL=https://painel.asttralabs.com.br
PAINEL_NOME=Asttra Labs
SESSAO_DIAS=1
PAINEL_PORTA=18000
TZ=America/Sao_Paulo
PAINEL_SRC=/opt/asttra/painel-src/painel
EOF'
sudo cut -d= -f1 .env
```

49. **Construir a imagem e subir** (no servidor). O primeiro build leva alguns minutos e usa bastante CPU. Deve terminar com o `painel` como `healthy` e a porta 18000 só em `127.0.0.1`.

```bash
cd /opt/asttra/painel
sudo docker compose up -d --build --wait
sudo docker compose ps
ss -tlnp | grep ':18000'
```

50. **Criar o usuário do painel** (no servidor). Pede o e-mail, o nome e a senha (duas vezes, sem aparecer na tela, mínimo de 12 caracteres). Guarde a senha no gerenciador como "Painel – login do Davi".

```bash
cd /opt/asttra/painel
sudo docker compose exec painel pnpm usuario criar
```

51. **Criar a rota no tunnel** (navegador, Zero Trust → Networks → Tunnels → `vps-asttra` → Published application routes → Add). `painel.asttralabs.com.br` → `http://localhost:18000`. A Cloudflare cria o registro DNS sozinha.
52. **Proteger com o Cloudflare Access** (Zero Trust → Access → Applications → Add → Self-hosted). Nome `Painel`, domínio `painel.asttralabs.com.br`, a policy `Só Davi` (a mesma do teste), login por código no e-mail, sessão de 1 mês.
53. **Testar** (no servidor e depois no navegador, no celular e no computador):
    - `sudo docker compose exec painel pnpm aviso criar --tipo alerta --mensagem "Teste"` termina sem erro;
    - `https://painel.asttralabs.com.br` pede primeiro o código da Cloudflare e depois o login do painel;
    - uma senha errada mostra "E-mail ou senha incorretos"; a certa abre a Início com a faixa "Teste";
    - Resolver faz a faixa sumir, e a tela Atividades mostra `login` e `aviso_resolvido`;
    - o botão troca entre claro e escuro, e a escolha continua depois de recarregar;
    - Sair volta para `/entrar`, e abrir `/atividades` direto também leva para `/entrar`.

### Atualizar o painel

Fora do horário de uso (o build pesa no servidor por alguns minutos), no servidor:

```bash
cd /opt/asttra/painel-src && git pull
cd /opt/asttra/painel && sudo docker compose up -d --build --wait
```

Se o `infra/painel/compose.yml` mudou, copie antes por cima, sem apagar o `.env`: `sudo cp /opt/asttra/painel-src/infra/painel/compose.yml /opt/asttra/painel/`.

### Trocar ou recuperar a senha do painel

No servidor. Encerra todas as sessões abertas. Também dá para trocar pela tela Configurações, que pede a senha atual.

```bash
cd /opt/asttra/painel
sudo docker compose exec painel pnpm usuario senha
```

## Paperclip

O Paperclip guarda as tarefas e os pedidos de aprovação dos agentes. Ele roda num container no servidor, atrás do Cloudflare Tunnel e do Cloudflare Access, com login próprio. Spec: [`specs/004-paperclip.md`](specs/004-paperclip.md). Decisão: [ADR 0006](adr/0006-paperclip-da-imagem-oficial-com-postgresql-externo.md), sobre a imagem oficial da versão presa pelo digest, sem as CLIs de terceiros e sem compilar no servidor, e o PostgreSQL compartilhado.

No servidor:
- `/opt/asttra/paperclip`: cópia de `infra/paperclip/` deste repositório. Tem:
  - o `.env` (permissão `600`, dono `root`);
  - o `configuracao.env` (empresa e projetos, sem segredos);
  - a pasta `dados/` (do usuário 1000, com a `master.key`, que entra no backup diário).

O container escuta só em `127.0.0.1:18100`, usa o banco `paperclip` e aplica as migrações dele na subida. Ele responde em `/api/health`. Tem limite de 1,5 GB de memória: na primeira subida, as 330 migrações levaram o uso a cerca de 810 MB, e o limite de 1 GB da spec estourava o heap do Node.

Os scripts de `infra/paperclip/` que mexem na configuração não usam senha nem chave guardada. Eles mostram um link, você aprova no navegador (já logado no Paperclip) e, no fim, eles revogam a chave temporária.

**Antes de começar:** o PR da spec 004 precisa estar na `main`. Os arquivos saem de `/opt/asttra/painel-src`.

### Instalação (executada em 2026-11-03)

54. **Conferir que a porta está livre e instalar o `jq`** (no servidor). O `ss` não deve mostrar nada. O `jq` lê as respostas da API nos scripts.

```bash
ss -tlnp | grep ':18100'
sudo apt-get install -y jq
```

55. **Conferir a versão** (navegador). Veja em `github.com/paperclipai/paperclip`, aba Releases, se há versão mais nova que a do `infra/paperclip/.env.example` e se há issues abertas sobre instalações próprias. Para trocar de versão, siga "Trocar a versão do Paperclip" antes de continuar.

56. **Copiar a implantação e criar a pasta de dados** (no servidor). A pasta `dados` fica com o usuário 1000, que é o usuário do processo dentro do container, e só ele a lê.

```bash
cd /opt/asttra/painel-src && git pull
sudo cp -r /opt/asttra/painel-src/infra/paperclip /opt/asttra/paperclip
sudo chown -R root:root /opt/asttra/paperclip
sudo chmod 755 /opt/asttra/paperclip/*.sh
sudo install -d -o 1000 -g 1000 -m 700 /opt/asttra/paperclip/dados
```

57. **Criar o `.env` e o `configuracao.env`** (no servidor). Os três segredos são gerados na hora, um diferente para cada. A senha do banco vem do `.env` do banco. Nada aparece na tela; o `cut` mostra só os nomes.

```bash
cd /opt/asttra/paperclip
sudo install -m 600 -o root -g root /dev/null .env
sudo bash -c 'S=$(grep "^PAPERCLIP_DB_PASSWORD=" /opt/asttra/banco/.env | cut -d= -f2-); cat > /opt/asttra/paperclip/.env <<EOF
$(grep -E "^PAPERCLIP_(VERSAO|IMAGEM)=" /opt/asttra/paperclip/.env.example)
DATABASE_URL=postgres://paperclip:$S@postgres:5432/paperclip
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
PAPERCLIP_AGENT_JWT_SECRET=$(openssl rand -hex 32)
PAPERCLIP_TOOL_ACTION_SIGNING_SECRET=$(openssl rand -hex 32)
PAPERCLIP_PUBLIC_URL=https://agentes.asttralabs.com.br
PAPERCLIP_AUTH_PUBLIC_BASE_URL=https://agentes.asttralabs.com.br
PAPERCLIP_ALLOWED_HOSTNAMES=agentes.asttralabs.com.br
TRUST_PROXY=1
PAPERCLIP_PORTA=18100
TZ=America/Sao_Paulo
EOF'
sudo cut -d= -f1 .env
sudo sed 's#https://agentes.exemplo.com.br#https://agentes.asttralabs.com.br#' configuracao.env.example | sudo tee configuracao.env
```

58. **Montar a imagem** (no servidor). Baixa a imagem oficial presa pelo digest (cerca de 2,5 GB, só na primeira vez) e monta a final, sem as CLIs de terceiros. Não compila nada.

```bash
cd /opt/asttra/paperclip
sudo docker compose build paperclip
```

59. **Criar a `master.key`** (no servidor). O Paperclip só cria a chave quando grava o primeiro segredo. Criada agora, ela entra no backup desde o primeiro dia. A chave é gerada dentro do container e não aparece na tela. Deve responder "master.key criada"; rodar de novo responde "já existe".

```bash
sudo /opt/asttra/paperclip/criar-master-key.sh
```

60. **Subir e conferir** (no servidor). Confira estes resultados:
    - o `paperclip` aparece como `healthy`;
    - a porta 18100 aparece só em `127.0.0.1`;
    - o UFW continua só com o OpenSSH;
    - o log mostra as migrações aplicadas, sem erro;
    - a `master.key` aparece na pasta de dados.

    **Se as migrações falharem no PostgreSQL 18, pare aqui** (`sudo docker compose down`) e leve o log ao Davi. Não troque para o banco embutido nem para outra versão sem aprovação.

```bash
cd /opt/asttra/paperclip
sudo docker compose up -d --wait
sudo docker compose ps
ss -tlnp | grep ':18100'
sudo ufw status
sudo docker compose logs paperclip | grep -i migrat
sudo ls -l dados/instances/default/secrets/
```

61. **Criar a rota no tunnel** (navegador: Zero Trust → Networks → Tunnels → `vps-asttra` → Published application routes → Add). Aponte `agentes.asttralabs.com.br` para `http://localhost:18100`.
62. **Proteger com o Cloudflare Access** (Zero Trust → Access → Applications → Add → Self-hosted). Use o nome `Paperclip`, o subdomínio `agentes`, a policy `Só Davi`, login por código no e-mail e sessão de 1 mês. Confira no Preview que o destino é `agentes.asttralabs.com.br`.
63. **Criar o primeiro admin** (no servidor, depois no navegador). O script mostra um link de uso único que vale 1 hora. Abra o link, crie a conta com o seu e-mail e uma senha nova e aceite o convite. Guarde a senha no gerenciador como "Paperclip – login do Davi". Rodar o script de novo depois disso só responde que já há admin.

```bash
sudo /opt/asttra/paperclip/convite-admin.sh
```

64. **Configurar a empresa** (no servidor, depois no navegador). O script mostra um link. Abra-o no navegador já logado no Paperclip e aprove o acesso. Ele cria a empresa "Asttra Labs" e os 5 projetos, liga a trava de contratação, deixa o orçamento em 0 (que no Paperclip quer dizer sem limite) e grava a regra de `regra-de-aprovacao.md`. O resultado deve terminar com "Configuração concluída" e "Chave temporária revogada". Rodar de novo não duplica nada.

```bash
/opt/asttra/paperclip/configurar.sh
```

65. **Incluir a pasta de dados no backup** (no servidor). Copie a versão nova dos scripts de backup e acrescente o `PAPERCLIP_DADOS` ao `backup.env`. Depois rode um backup à mão e confira o snapshot com a tag `paperclip`. O `restaurar.sh` deve terminar com "contém a master.key" e "contagens iguais".

```bash
sudo cp /opt/asttra/painel-src/infra/banco/backup/{backup.sh,restaurar.sh,backup.env.example} /opt/asttra/banco/backup/
sudo chmod 755 /opt/asttra/banco/backup/*.sh
sudo grep -q '^PAPERCLIP_DADOS=' /opt/asttra/banco/backup/backup.env || echo 'PAPERCLIP_DADOS=/opt/asttra/paperclip/dados' | sudo tee -a /opt/asttra/banco/backup/backup.env
sudo /opt/asttra/banco/backup/backup.sh
sudo bash -c 'set -a; . /opt/asttra/banco/backup/backup.env; restic snapshots --tag paperclip'
sudo /opt/asttra/banco/backup/restaurar.sh
```

66. **Teste de aprovação (o "Pronto quando")** (no servidor e no navegador). Primeiro o script pede acesso; aprove o link como no passo 64. Depois ele cria o pedido de teste. No Paperclip, abra Approvals, veja o pedido "Pedido de teste (spec 004)" como pendente e clique em Approve. O script deve imprimir `Status do pedido: approved` e "Chave temporária revogada".

```bash
/opt/asttra/paperclip/teste-aprovacao.sh
```

67. **Conferir a persistência e o acesso** (no servidor, depois no celular fora da rede de casa).
    - Recrie o container com o comando abaixo.
    - Abra `https://agentes.asttralabs.com.br`. Deve aparecer primeiro o código da Cloudflare e depois o login do Paperclip.
    - Dentro, a empresa deve ter os 5 projetos, a regra na descrição e o pedido de teste como aprovado.

```bash
cd /opt/asttra/paperclip && sudo docker compose up -d --force-recreate --wait
```

### Trocar a versão do Paperclip

A troca é manual e deliberada. Antes, leia as notas da versão nova e compare o `Dockerfile` oficial com o `infra/paperclip/Dockerfile`, principalmente as variáveis e o comando final (ADR 0006).
1. No Windows, ache o digest da versão nova com `docker buildx imagetools inspect ghcr.io/paperclipai/paperclip:<versão sem o v>` (linha "Digest"). Mude `PAPERCLIP_VERSAO` e `PAPERCLIP_IMAGEM` em `infra/paperclip/.env.example`, rode `bash scripts/teste-paperclip.sh` e faça o PR.
2. Rode um backup manual (passo 65).
3. No servidor, depois do merge:

```bash
cd /opt/asttra/painel-src && git pull
cd /opt/asttra/paperclip
sudo sed -i "s#^PAPERCLIP_VERSAO=.*#$(grep '^PAPERCLIP_VERSAO=' /opt/asttra/painel-src/infra/paperclip/.env.example)#; s#^PAPERCLIP_IMAGEM=.*#$(grep '^PAPERCLIP_IMAGEM=' /opt/asttra/painel-src/infra/paperclip/.env.example)#" .env
sudo grep -E '^PAPERCLIP_(VERSAO|IMAGEM)=' .env
sudo docker compose build paperclip
sudo docker compose up -d --wait
```

A imagem anterior continua no servidor. Para voltar atrás, volte as duas linhas do `.env` e rode `sudo docker compose up -d`. Quando a versão nova estiver estável, libere espaço com `sudo docker image prune -a` (apaga as imagens que nenhum container usa). Se a versão nova já aplicou migrações, volte também o banco `paperclip` pelo backup.

## Hermes

O Hermes é o agente que conversa com você pelo Telegram e cria as tarefas no Paperclip. Ele roda num container próprio, sem porta publicada, sem terminal e sem o socket do Docker. O Paperclip o chama pela rede interna `asttra`, na porta 8642. Spec: [`specs/005-hermes-no-telegram.md`](specs/005-hermes-no-telegram.md). Decisão: [ADR 0007](adr/0007-hermes-em-container-proprio-sem-terminal.md).

No servidor:
- `/opt/asttra/hermes`: cópia de `infra/hermes/` deste repositório. Tem:
  - o `.env` (permissão `600`, dono `root`), com os tokens do Telegram e do OpenRouter, a chave da API do Hermes e a chave de agente do Paperclip;
  - a pasta `dados/` (do usuário `hermes`, UID 10000), com a memória, as sessões, o `config.yaml` e o `SOUL.md`. Ela entra no backup diário com a tag `hermes` e não guarda segredos.
- O Hermes busca as mensagens no Telegram (long polling). Por isso não precisa de rota no tunnel nem de porta aberta.

**Antes de começar:** o PR da spec 005 precisa estar na `main`, e o Paperclip precisa estar no ar (passos 54 a 67).

### Instalação

68. **Criar o bot no Telegram** (celular). Abra o `@BotFather` e mande `/newbot`. Dê um nome (por exemplo, "Hermes Asttra") e um usuário terminado em `bot`. Ele responde com o token: guarde no gerenciador como "Telegram – bot do Hermes". Depois mande `/setjoingroups`, escolha o bot e marque `Disable`, para ninguém colocar o bot num grupo.
69. **Descobrir o seu ID do Telegram** (celular). Abra o `@userinfobot` e mande qualquer mensagem. Ele responde com um número (o "Id"): anote. É só esse número que o Hermes vai aceitar.
70. **Criar a conta do OpenRouter, sem créditos** (navegador, em `openrouter.ai`). Crie a conta, **não cadastre cartão nem compre créditos** e crie uma chave em Keys com o nome `hermes-asttra`. Guarde a chave no gerenciador como "OpenRouter – chave do Hermes". Sem créditos, nada pode ser cobrado; os modelos gratuitos têm um limite diário de pedidos.
71. **Escolher o modelo gratuito** (navegador, com o Davi decidindo). Em `openrouter.ai/models`, filtre pelos gratuitos (`:free`) que aceitam ferramentas ("tools"). O Hermes precisa disso para criar tarefas. Em cada candidato, abra a aba de provedores e leia a política de dados.
    - Escolhido em 2026-11-04: `nvidia/nemotron-3-ultra-550b-a55b:free`. A NVIDIA registra as conversas do endpoint gratuito, por isso o `config.yaml` usa `data_collection: allow`. **Não mande ao Hermes dados pessoais nem informação confidencial de clientes.**
    - Ao trocar de modelo, leia de novo a política de dados. Mudar a regra de dados é decisão do Davi, registrada na spec 005.
    - Em Settings > Privacy, confira se a conta não bloqueia o modelo escolhido.
    - Anote o nome completo do modelo (por exemplo, `fornecedor/modelo:free`).
72. **Liberar o nome interno do Paperclip** (no servidor). O Hermes chama o Paperclip por `http://paperclip:3100`, e o Paperclip só aceita os nomes da lista `PAPERCLIP_ALLOWED_HOSTNAMES`. A linha mostrada no fim deve terminar com `,paperclip`.

```bash
cd /opt/asttra/paperclip
sudo sed -i '/^PAPERCLIP_ALLOWED_HOSTNAMES=/{/,paperclip$/!s#$#,paperclip#}' .env
sudo grep '^PAPERCLIP_ALLOWED_HOSTNAMES=' .env
sudo docker compose up -d --wait
```

73. **Copiar a implantação** (no servidor). A pasta `dados` é criada vazia; o container passa a dona dela para o usuário `hermes` na primeira subida.

```bash
cd /opt/asttra/painel-src && git pull
sudo cp -r /opt/asttra/painel-src/infra/hermes /opt/asttra/hermes
sudo chown -R root:root /opt/asttra/hermes
sudo chmod 755 /opt/asttra/hermes/*.sh
sudo install -d -m 700 /opt/asttra/hermes/dados
```

74. **Criar o `.env`** (no servidor). A chave da API do Hermes é gerada na hora. Os dois tokens são colados com o **botão direito do mouse** e não aparecem na tela; o comando mostra só quantos caracteres recebeu. O ID do Telegram e o modelo aparecem, porque não são segredo. A `PAPERCLIP_API_KEY` fica vazia: o passo 76 a preenche.

```bash
sudo bash -c 'umask 077; cd /opt/asttra/hermes
read -rsp "Token do bot (BotFather): " TG; echo " -> ${#TG} caracteres (esperado 46)"
read -rsp "Chave do OpenRouter: " OR; echo " -> ${#OR} caracteres (esperado mais de 60)"
read -rp "Seu ID do Telegram (só números): " ID
read -rp "Modelo gratuito (termina em :free): " MOD
[[ $TG == *:* && $OR == sk-or-* && $ID =~ ^[0-9]+$ && $MOD == *:free ]] || { echo "Formato errado, nada foi gravado."; exit 1; }
cat > .env <<EOF
$(grep "^HERMES_IMAGEM=" .env.example)
HERMES_MODELO=$MOD
HERMES_DONO=Davi
OPENROUTER_API_KEY=$OR
TELEGRAM_BOT_TOKEN=$TG
TELEGRAM_ALLOWED_USERS=$ID
API_SERVER_KEY=$(openssl rand -hex 32)
PAPERCLIP_API_URL=http://paperclip:3100
PAPERCLIP_URL_PUBLICA=https://agentes.asttralabs.com.br
PAPERCLIP_API_KEY=
TZ=America/Sao_Paulo
EOF
echo "Gravado."'
sudo cut -d= -f1 /opt/asttra/hermes/.env
```

75. **Baixar a imagem** (no servidor). Baixa a imagem oficial presa pelo digest (cerca de 1,1 GB, só na primeira vez).

```bash
cd /opt/asttra/hermes
sudo docker compose pull
```

76. **Ligar o Hermes ao Paperclip** (no servidor, depois no navegador).
    - O script mostra primeiro um link de acesso: aprove-o como no passo 64.
    - Depois ele pede a contratação do agente "Hermes": no Paperclip, abra Approvals e aprove o pedido de contratação (`hire_agent`).
    - Por fim, ele cria a chave de agente, grava no `.env` sem mostrar e copia o `config.yaml` e o `SOUL.md` para `dados/`.
    - O resultado deve terminar com "Configuração concluída" e "Chave temporária revogada". Rodar de novo não duplica nada.
    - Logo depois da aprovação, o Paperclip tenta falar com o Hermes, que ainda não subiu, e registra um aviso no log dele. É esperado; o passo 77 resolve.

```bash
sudo /opt/asttra/hermes/configurar.sh
```

77. **Subir e conferir** (no servidor). Confira estes resultados:
    - o `hermes` aparece como `healthy`;
    - o `PortBindings` aparece como `{}`, ou seja, sem portas publicadas;
    - o UFW continua só com o OpenSSH;
    - o log mostra o Telegram conectado, sem erro;
    - o `docker stats` mostra a memória usada. Anote o valor para o TRD.

```bash
cd /opt/asttra/hermes
sudo docker compose up -d --wait
sudo docker compose ps
sudo docker inspect --format '{{json .HostConfig.PortBindings}}' "$(sudo docker compose ps -q hermes)"
sudo ufw status
sudo docker compose logs hermes | grep -i -E 'telegram|error' | tail -20
sudo docker stats --no-stream "$(sudo docker compose ps -q hermes)"
```

78. **Incluir a pasta de dados no backup** (no servidor). Copie a versão nova dos scripts de backup. O padrão já aponta para `/opt/asttra/hermes/dados`. Rode um backup à mão e confira o snapshot com a tag `hermes`. O `restaurar.sh` deve terminar com "contém o config.yaml".

```bash
sudo cp /opt/asttra/painel-src/infra/banco/backup/{backup.sh,restaurar.sh,backup.env.example} /opt/asttra/banco/backup/
sudo chmod 755 /opt/asttra/banco/backup/*.sh
sudo /opt/asttra/banco/backup/backup.sh
sudo bash -c 'set -a; . /opt/asttra/banco/backup/backup.env; restic snapshots --tag hermes'
sudo /opt/asttra/banco/backup/restaurar.sh
```

79. **Teste de ponta a ponta (o "Pronto quando")** (celular e navegador). Siga a "Verificação de ponta a ponta" da spec 005:
    1. Mande ao bot: "cria uma tarefa em Crescimento: preparar proposta para a empresa X". Ele deve mostrar o que entendeu e perguntar se confirma, **sem criar nada**.
    2. Responda "sim". Ele deve mandar o link, e a tarefa deve aparecer no projeto Crescimento em `agentes.asttralabs.com.br`.
    3. Peça outra tarefa e responda "não". Nada deve ser criado.
    4. Pergunte "quais são os departamentos?". Ele deve responder direto.
    5. Peça "roda `ls /`". Ele deve dizer que não tem terminal.
    6. De outra conta do Telegram, escreva ao bot. Não deve haver resposta.
    7. Recrie o container (comando abaixo) e pergunte algo que ele guardou na memória. A resposta deve continuar certa.

```bash
cd /opt/asttra/hermes && sudo docker compose up -d --force-recreate --wait
```

### Trocar a versão do Hermes

A troca é manual. Antes, leia as notas da versão nova: o Hermes pode ligar ferramentas novas por padrão (ADR 0007).
1. No Windows, ache o digest com `docker buildx imagetools inspect nousresearch/hermes-agent:<tag>` (linha "Digest"). Mude `HERMES_IMAGEM` em `infra/hermes/.env.example` e rode `bash scripts/teste-hermes.sh`. Ele falha se alguma ferramenta proibida voltar ligada. Depois faça o PR.
2. No servidor, depois do merge:

```bash
cd /opt/asttra/painel-src && git pull
sudo cp /opt/asttra/painel-src/infra/hermes/{config.yaml,SOUL.md,compose.yml,configurar.sh} /opt/asttra/hermes/
sudo cp -r /opt/asttra/painel-src/infra/hermes/mcp-paperclip /opt/asttra/hermes/
cd /opt/asttra/hermes
sudo sed -i "s#^HERMES_IMAGEM=.*#$(grep '^HERMES_IMAGEM=' /opt/asttra/painel-src/infra/hermes/.env.example)#" .env
sudo /opt/asttra/hermes/configurar.sh
sudo docker compose up -d --wait
```

O `configurar.sh` recopia o `config.yaml` e o `SOUL.md` para `dados/`. Para voltar atrás, volte a linha `HERMES_IMAGEM` do `.env` e rode `sudo docker compose up -d`.

### Trocar o modelo ou um token

Edite a linha no `.env` com `sudo nano /opt/asttra/hermes/.env` e recrie o container (`sudo docker compose up -d --force-recreate --wait`). Se trocar a `API_SERVER_KEY`, rode também `sudo HERMES_TROCAR_CHAVE_API=1 /opt/asttra/hermes/configurar.sh`, para o Paperclip receber a chave nova.

## Aprovações

Os pedidos de aprovação dos agentes ficam no Paperclip. Davi os decide na tela Aprovações do painel ou num **segundo bot do Telegram**, o bot de aprovações (não é o do Hermes). A primeira decisão vale, e o outro lugar mostra quem decidiu. Toda decisão fica em Atividades. Spec: [`specs/006-aprovacoes-no-painel-e-no-telegram.md`](specs/006-aprovacoes-no-painel-e-no-telegram.md). Decisão: [ADR 0008](adr/0008-bot-de-aprovacoes-e-chave-de-board-do-painel.md).

No servidor:
- O bot roda no serviço `bot-aprovacoes` de `/opt/asttra/painel`, com a mesma imagem do painel. Ele busca as mensagens no Telegram (long polling) e confere o Paperclip a cada 10 segundos. Não tem porta publicada nem rota no tunnel.
- O `.env` do painel ganha a **chave de board** `painel-aprovacoes` do Paperclip, criada sem validade. Quem tem essa chave pode aprovar e configurar a empresa no Paperclip: ela fica só nesse `.env`.

**Antes de começar:** o PR da spec 006 precisa estar na `main`, e o painel e o Paperclip precisam estar no ar.

### Instalação

80. **Criar o bot de aprovações** (celular). No `@BotFather`, mande `/newbot`. Dê um nome (por exemplo, "Aprovações Asttra") e um usuário terminado em `bot`. Guarde o token no gerenciador como "Telegram – bot de aprovações". Depois mande `/setjoingroups`, escolha o bot e marque `Disable`. Por fim, abra a conversa com o bot novo e toque em **Iniciar** (`/start`): sem isso, o Telegram não deixa o bot mandar a primeira mensagem.
81. **Conferir o seu ID do Telegram** (celular). É o mesmo número do passo 69 (`@userinfobot`). Só ele vai poder aprovar pelo bot.
82. **Liberar o nome interno do Paperclip** (no servidor). O painel e o bot chamam o Paperclip por `http://paperclip:3100`. Se o passo 72 já foi feito, o comando não muda nada. A linha mostrada deve terminar com `,paperclip`.

```bash
cd /opt/asttra/paperclip
sudo sed -i '/^PAPERCLIP_ALLOWED_HOSTNAMES=/{/,paperclip$/!s#$#,paperclip#}' .env
sudo grep '^PAPERCLIP_ALLOWED_HOSTNAMES=' .env
sudo docker compose up -d --wait
```

83. **Copiar os arquivos novos** (no servidor). O `.env` do painel não é tocado.

```bash
cd /opt/asttra/painel-src && git pull
sudo cp /opt/asttra/painel-src/infra/painel/{compose.yml,criar-chave-paperclip.sh} /opt/asttra/painel/
sudo chmod 755 /opt/asttra/painel/criar-chave-paperclip.sh
```

84. **Gravar o bot no `.env` do painel** (no servidor). O token é colado com o **botão direito do mouse** e não aparece na tela; o comando mostra só quantos caracteres recebeu. Rodar de novo troca os valores.

```bash
sudo bash -c 'cd /opt/asttra/painel
read -rsp "Token do bot de aprovações (BotFather): " TG; echo " -> ${#TG} caracteres (esperado 46)"
read -rp "Seu ID do Telegram (só números): " ID
[[ $TG == *:* && $ID =~ ^[0-9]+$ ]] || { echo "Formato errado, nada foi gravado."; exit 1; }
sed -i -E "/^(PAPERCLIP_URL|TELEGRAM_APROVACOES_TOKEN|TELEGRAM_APROVACOES_CHAT_ID)=/d" .env
printf "PAPERCLIP_URL=http://paperclip:3100\nTELEGRAM_APROVACOES_TOKEN=%s\nTELEGRAM_APROVACOES_CHAT_ID=%s\n" "$TG" "$ID" >> .env
echo "Gravado."'
sudo cut -d= -f1 /opt/asttra/painel/.env
```

85. **Criar a chave de board do painel** (no servidor, depois no navegador). O script mostra um link de acesso: aprove-o como no passo 64. Ele cria a chave `painel-aprovacoes` sem validade, grava `PAPERCLIP_CHAVE_BOARD` e `PAPERCLIP_EMPRESA_ID` no `.env` sem mostrar a chave e revoga a chave temporária. O resultado deve terminar com "Chave temporária revogada".

```bash
sudo /opt/asttra/painel/criar-chave-paperclip.sh
```

86. **Subir e conferir** (no servidor). O build leva alguns minutos; faça fora do horário de uso. Confira estes resultados:
    - `painel` aparece como `healthy` e `bot-aprovacoes` como `running`;
    - o `PortBindings` do bot aparece como `{}`;
    - o log do bot mostra "no ar", sem erro;
    - a última linha mostra `0`: nenhuma chave ou token apareceu no log.

```bash
cd /opt/asttra/painel
sudo docker compose up -d --build --wait
sudo docker compose ps
sudo docker inspect --format '{{json .HostConfig.PortBindings}}' "$(sudo docker compose ps -q bot-aprovacoes)"
sudo docker compose logs bot-aprovacoes | tail -20
sudo docker compose logs bot-aprovacoes | grep -c -E 'pcp_board_|bot[0-9]+:'
```

87. **Teste de ponta a ponta (o "Pronto quando")** (servidor, navegador e celular). Siga a "Verificação de ponta a ponta" da spec 006:
    1. No servidor, rode o comando abaixo. Em até ~15 segundos, o pedido deve aparecer na tela Aprovações e chegar no Telegram, com os botões Aprovar e Recusar. O script mostra um link de acesso: aprove-o como no passo 64.
    2. Aprove no painel. O script deve imprimir `approved`, e a mensagem no Telegram deve virar "Aprovado no painel às HH:MM", sem botões.
    3. Rode de novo com `TITULO="Teste 006 – Telegram"` e aprove pelo botão no Telegram. O script deve imprimir `approved`, e o pedido deve ir para "Últimos decididos" no painel com "no Telegram".
    4. Crie um terceiro pedido, toque em Recusar e responda à pergunta com um motivo. O script deve mostrar `Status do pedido: rejected` (e terminar com erro, porque espera `approved`). O motivo deve aparecer no histórico e em Atividades.
    5. Em Atividades, confira as três decisões (`aprovacao_aprovada` e `aprovacao_recusada`). Rode de novo a última linha do passo 86: deve mostrar `0`.
    6. De outra conta do Telegram, escreva ao bot. Nada deve acontecer.

```bash
sudo TITULO="Teste 006 – painel" /opt/asttra/paperclip/teste-aprovacao.sh
```

### Trocar a chave ou o token do bot

- **Chave de board:** rode de novo `sudo /opt/asttra/painel/criar-chave-paperclip.sh`. Ele cria uma chave nova e revoga a anterior. Depois, `cd /opt/asttra/painel && sudo docker compose up -d`.
- **Token do bot:** no `@BotFather`, use `/revoke` para gerar outro. Repita o passo 84 e rode `sudo docker compose up -d` em `/opt/asttra/painel`.

## Credenciais

Todas as credenciais ficam no gerenciador de senhas, com o mesmo padrão de nome e o IP do servidor anotado em cada item. Nenhum valor é registrado neste documento.

- **VPS Asttra – senha root**: manter guardada; serve para recuperação pelo terminal do navegador no painel da Hostinger.
- **VPS Asttra – senha usuário davi**: usada pelo `sudo`.
- **VPS Asttra – passphrase chave SSH**: destrava a chave privada.
- **Backup da chave privada** (`id_ed25519`): opcional, em gerenciador com suporte a chaves SSH (Bitwarden, 1Password). Nunca em e-mail, drive aberto ou chat.
- **VPS Asttra – senha do restic**: obrigatória. Sem ela nenhum backup pode ser restaurado.
- **Cloudflare R2 – token asttra-backups-restic**: Access Key ID, Secret Access Key e o ID da conta (só os valores, sem rótulos).
- **Healthchecks.io – URL de ping**: a URL da checagem `asttra-backup`.
- As senhas do PostgreSQL e do Redis ficam só em `/opt/asttra/banco/.env` (geradas no servidor).
- **Painel – login do Davi**: e-mail e senha do login próprio do painel (passo 50). O segredo das sessões (`BETTER_AUTH_SECRET`) fica só em `/opt/asttra/painel/.env`.
- **Paperclip – login do Davi**: e-mail e senha do login próprio do Paperclip (passo 63). Os segredos (`BETTER_AUTH_SECRET`, `PAPERCLIP_AGENT_JWT_SECRET`, `PAPERCLIP_TOOL_ACTION_SIGNING_SECRET`) ficam só em `/opt/asttra/paperclip/.env`. A `master.key` fica só na pasta de dados e no backup cifrado.

- **Telegram – bot do Hermes**: o token do `@BotFather` (passo 68).
- **OpenRouter – chave do Hermes**: a chave da conta sem créditos (passo 70).
- A `API_SERVER_KEY` do Hermes e a chave de agente do Paperclip ficam só em `/opt/asttra/hermes/.env` (geradas no servidor). A `API_SERVER_KEY` também fica guardada como segredo do Paperclip (`hermes-api-key`).
- **Telegram – bot de aprovações**: o token do segundo bot (passo 80).
- A chave de board `painel-aprovacoes` do Paperclip fica só em `/opt/asttra/painel/.env` (passo 85). Não vai para o gerenciador: se perder, rode o script de novo.

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
| `chmod: cannot access '/opt/asttra/banco/init/*.sh'` e `ls: Permission denied` | O `scp` criou a pasta só para o dono; depois do `chown root`, o shell do davi não lê a pasta nem expande o `*` | Acertar as permissões com `sudo find ... -exec chmod` (passo 31) |
| `scp: stat local "infra/banco": No such file or directory` | O `scp` rodou fora da pasta do repositório | `cd` para a pasta do repositório antes (passo 30) |
| `read -s` recebe 0 ou 1 caractere | O Ctrl+V não cola no terminal | Colar com o botão direito do mouse (ou Ctrl+Shift+V) |
| Chave com caracteres a mais (ex.: 68 em vez de 64) | Rótulo salvo junto no gerenciador (`Key=...`) | Salvar só o valor no gerenciador e repetir o `read` daquela chave. Se o `read` acabou de rodar (antes do `unset`), `SK=${SK#Key=}` remove o prefixo |
| `restic init` ou `curl` no R2 dá `Unauthorized` | Access Key ID errado (por exemplo, o ID da conta no lugar), Secret de outro token ou token sem acesso ao bucket | Criar token novo e trocar as chaves ("Trocar as chaves do R2") |
| `journalctl -u asttra-backup.service` mostra "No entries" | O log do sistema só aparece com permissão de administrador | `sudo journalctl ...` |
| O build do painel para com "Killed" ou "JavaScript heap out of memory" | Faltou memória no servidor durante o `next build` | Rodar o build fora do horário de uso; se repetir, rever o ADR 0005 (gatilho "falta de memória") |
| O painel fica `unhealthy` e o log mostra "Falha nas migrações" | O `DATABASE_URL` está errado ou o banco não está na rede `asttra` | Conferir o `.env` (passo 48) e o `sudo docker compose ps` em `/opt/asttra/banco` |
| O login responde "Muitas tentativas" | Muitas tentativas do mesmo IP em 15 minutos | Esperar 15 minutos; se esqueceu a senha, trocar pelo servidor ("Trocar ou recuperar a senha do painel") |
| O subdomínio do painel responde 502 | A rota do tunnel aponta para o lugar errado (tipo `HTTPS` em vez de `HTTP`, ou URL diferente de `localhost:18000`) | Corrigir a rota no tunnel `vps-asttra`; o cloudflared usa `network_mode: host`, então `localhost` é o servidor |
| O Access protege o domínio inteiro em vez do subdomínio | O campo Subdomain ficou vazio em Destinations | Preencher Subdomain (`painel`) e conferir no Preview o destino `painel.asttralabs.com.br` antes de salvar |
| O Paperclip reinicia em loop e o log mostra `EACCES` em `/paperclip` | A pasta `dados` não é do usuário 1000 | `sudo chown -R 1000:1000 /opt/asttra/paperclip/dados` (passo 56) |
| O Paperclip responde "This hostname is not allowed" | O endereço público não está em `PAPERCLIP_ALLOWED_HOSTNAMES` | Conferir o `.env` (passo 57) e recriar o container |
| `configurar.sh` dá "jq não encontrado" | Falta o `jq` no servidor | `sudo apt-get install -y jq` (passo 54) |
| O link de aprovação do script mostra a tela de login | O navegador não está logado no Paperclip | Entrar no Paperclip e abrir o link de novo (vale 10 minutos) |
| `configurar.sh` dá "Instance admin required" | A conta que aprovou o link não é a admin do passo 63 | Aprovar com a conta do Davi |
| Depois do convite, o Paperclip abre um assistente que pede o nome da organização e o "primeiro agente", sem opção de pular | É o onboarding do Paperclip; a empresa ainda não tem agentes | Não crie o agente (a spec 004 proíbe). Se a empresa já foi criada pelo assistente com o nome do `configuracao.env`, o `configurar.sh` a reaproveita. Feche a aba e siga para o passo 64 |
| O link da aprovação sempre cai no assistente de "primeiro agente" | O assistente aparece enquanto a empresa não tem agentes | Abra o pedido direto: `https://agentes.asttralabs.com.br/AST/approvals/<id>` (`AST` é o prefixo da empresa; confira com `SELECT issue_prefix FROM companies` no banco `paperclip`) |
| Um comando com `\| tail` parece travado | O `tail` só mostra a saída quando o comando termina | Esperar, ou rodar sem o `\| tail` para ver o progresso. Se der Ctrl+C no backup, conferir se ficou trava: `restic list locks` (como no passo 38) |
| Ao colar um bloco grande no terminal, uma linha sai cortada | O terminal perdeu parte da colagem | Conferir com `sudo grep` as linhas que não são segredo e corrigir com `sed -i` |
| `convite-admin.sh` dá "permission denied" no `.env` | O script chama o `docker compose` do banco, que lê o `.env` do root | Rodar com `sudo` |
| `docker compose build` dá "manifest unknown" ou "not found" | `PAPERCLIP_IMAGEM` com versão ou digest errado | Conferir com `docker buildx imagetools inspect` (ver "Trocar a versão do Paperclip") |
| O Hermes não responde no Telegram e o log mostra "unauthorized user" | O ID em `TELEGRAM_ALLOWED_USERS` está errado | Conferir o ID com o `@userinfobot` (passo 69), corrigir o `.env` e recriar o container |
| O Hermes responde que não conseguiu criar a tarefa ("HTTP 403") | Falta `paperclip` em `PAPERCLIP_ALLOWED_HOSTNAMES` do Paperclip | Passo 72 |
| O Hermes responde "recusou a chave do Hermes" | A chave de agente foi revogada ou o `.env` perdeu a linha | Rodar de novo o `configurar.sh` (passo 76) e recriar o container |
| O Hermes avisa que o limite acabou ou não responde a nada | O limite diário dos modelos gratuitos do OpenRouter acabou | Esperar o dia seguinte. Não compre créditos sem aprovação (regra de custo) |
| O log do Hermes mostra erro 404 ou "no endpoints" no OpenRouter | O modelo saiu do ar, ou nenhum provedor dele aceita `data_collection: deny` | Escolher outro modelo (passo 71) e trocar ("Trocar o modelo ou um token") |
| `configurar.sh` do Hermes fica esperando a aprovação da contratação | O pedido `hire_agent` não foi aprovado no Paperclip | Abrir Approvals no Paperclip e aprovar; o script espera até 10 minutos |
| O bot de aprovações não manda nada e o log mostra "chat not found" ou "Forbidden" | Davi não iniciou a conversa com o bot, ou o ID está errado | Tocar em Iniciar na conversa com o bot (passo 80) e conferir o ID (passo 81) |
| A tela Aprovações mostra "O Paperclip recusou a chave do painel" | A chave `painel-aprovacoes` foi revogada ou o `.env` perdeu a linha | Rodar de novo o `criar-chave-paperclip.sh` (passo 85) e `sudo docker compose up -d` |
| A tela Aprovações diz "Não consegui falar com o Paperclip" ou dá "HTTP 403" | O Paperclip está parado, ou falta `paperclip` em `PAPERCLIP_ALLOWED_HOSTNAMES` | `sudo docker compose ps` em `/opt/asttra/paperclip` e o passo 82 |
| O log do bot mostra "Conflict: terminated by other getUpdates request" | Há dois processos usando o mesmo token (por exemplo, o token do Hermes no lugar do bot de aprovações) | Conferir que os dois bots têm tokens diferentes (passos 68 e 80) |
| O subdomínio do tunnel não abre (DNS não existe) | A rota não foi criada na tela de criação do tunnel | Na tela de criação do tunnel, clicar em Continue e criar a rota em Routes > Add route; sem isso o DNS do subdomínio não existe |

## Próximos passos

- [x] Acesso por chave SSH com usuário administrador
- [x] Login root e login por senha bloqueados
- [x] Firewall (UFW) liberando só o SSH
- [x] Fail2ban contra tentativas repetidas de acesso
- [x] Atualizações de segurança automáticas
- [x] Docker pelo repositório oficial
- [x] Cloudflare na frente dos serviços, sem portas abertas (Tunnel e Access)
- [x] Painel no ar em `painel.asttralabs.com.br` (Etapa 1, item 3: passos 43 a 53 executados em 02/11/2026)
- [x] Paperclip no ar em `agentes.asttralabs.com.br` (Etapa 1, item 5: passos 54 a 67 executados em 03/11/2026)
- [x] Hermes no Telegram (Etapa 1, item 6a: passos 68 a 79 executados em 08/11/2026)
- [x] Aprovações no painel e no Telegram (Etapa 1, item 6b: passos 80 a 87 executados em 08/11/2026; falta o teste com outra conta do Telegram, passo 87.6)
- [x] Rotina de backup (Etapa 1, item 2: passos 27 a 42 executados em 02/11/2026; primeiro backup automático das 03:00 confirmado em 03/11/2026)
