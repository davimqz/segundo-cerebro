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

## Credenciais

Todas as credenciais ficam no gerenciador de senhas, com o mesmo padrão de nome e o IP do servidor anotado em cada item. Nenhum valor é registrado neste documento.

- **VPS Asttra – senha root**: manter guardada; serve para recuperação pelo terminal do navegador no painel da Hostinger.
- **VPS Asttra – senha usuário davi**: usada pelo `sudo`.
- **VPS Asttra – passphrase chave SSH**: destrava a chave privada.
- **Backup da chave privada** (`id_ed25519`): opcional, em gerenciador com suporte a chaves SSH (Bitwarden, 1Password). Nunca em e-mail, drive aberto ou chat.

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
| O subdomínio do tunnel não abre (DNS não existe) | A rota não foi criada na tela de criação do tunnel | Na tela de criação do tunnel, clicar em Continue e criar a rota em Routes > Add route; sem isso o DNS do subdomínio não existe |

## Próximos passos

- [x] Acesso por chave SSH com usuário administrador
- [x] Login root e login por senha bloqueados
- [x] Firewall (UFW) liberando só o SSH
- [x] Fail2ban contra tentativas repetidas de acesso
- [x] Atualizações de segurança automáticas
- [x] Docker pelo repositório oficial
- [x] Cloudflare na frente dos serviços, sem portas abertas (Tunnel e Access)
- [ ] Rotina de backup (movida para a Etapa 1, junto com o PostgreSQL: ainda não há dados para copiar)
