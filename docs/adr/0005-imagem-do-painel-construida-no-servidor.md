# 0005. Imagem Docker do painel construída no servidor

- Status: Aceito
- Data: 2026-11-02
- Decidido por: Davi

## Contexto
O painel roda num container no VPS (2 vCPU e 8 GB de RAM), atrás do Cloudflare Tunnel (spec 002). Alguém precisa transformar o código em imagem Docker a cada atualização. As restrições:
- o custo tem teto de R$ 100 por mês;
- o repositório é privado;
- a implantação precisa ser replicável num cliente, sem passos fora do playbook.

## Decisão
A imagem é construída **no próprio servidor**, com `git pull` e `docker compose build` em `/opt/asttra/painel`, a partir do `painel/Dockerfile`. A atualização é manual, por comando.

## Alternativas consideradas
- **GitHub Actions com publicação no GHCR:** o servidor só baixaria a imagem pronta. Porém, em repositório privado, o plano gratuito tem só 500 MB de pacotes, que poucas versões da imagem já ocupam. Também exigiria um token de leitura do GitHub guardado no servidor.
- **Deploy automático a cada merge (por exemplo, com webhook):** tira o Davi da decisão de quando atualizar e abre mais uma entrada no servidor. Fica para depois, se a frequência de atualização pedir.

## Consequências
- Não há serviço externo novo, custo nem token extra no servidor. O mesmo passo a passo serve para o servidor de um cliente.
- O build do Next.js usa CPU e RAM do servidor por alguns minutos e pode deixar os outros serviços mais lentos enquanto roda. Convém atualizar fora do horário de uso.
- O servidor precisa de uma cópia do repositório (`/opt/asttra/painel-src`), com acesso de leitura ao GitHub por chave de deploy, só de leitura.
- **Gatilho para rever:** o build falha por falta de memória, passa de 10 minutos, ou a Asttra passa a manter vários servidores de clientes, quando uma imagem única publicada compensa.
