# 0003. Backup com restic e alerta pelo Healthchecks.io

- Status: Proposto
- Data: 2026-11-02
- Decidido por: Davi (a confirmar no PR)

## Contexto
O PostgreSQL guarda os dados do painel, do n8n e do Paperclip numa única instância. O backup precisa ser diário, criptografado, guardar 7 cópias diárias e 4 semanais no Cloudflare R2 (gratuito até 10 GB) e avisar quando falhar ou deixar de rodar. Tudo dentro do teto de custo e com licenças que permitam implantar no servidor de um cliente.

## Decisão
- `pg_dumpall --globals-only` e `pg_dump -Fc` de cada banco, num diretório temporário apagado ao fim.
- **restic** (BSD-2, pelo apt) envia os dumps ao R2 pela API S3, criptografados com uma senha guardada também no gerenciador de senhas, e aplica a retenção com `restic forget --keep-daily 7 --keep-weekly 4 --prune`.
- **Healthchecks.io** (plano Hobby gratuito) recebe os avisos de início, sucesso e falha (`/fail`). Se nenhum aviso chegar em 1 dia + 2 horas, manda e-mail.
- Um timer do systemd dispara às 03:00 de Brasília, com `Persistent=true`.
- O teste de restauração (`restaurar.sh`) restaura num banco separado e compara as contagens de linhas.

## Alternativas consideradas
- **pg_dump + rclone:** rclone copia arquivos, mas a criptografia (`crypt`), a retenção e a verificação teriam de ser montadas à mão em script. Cada dia seria um dump completo, sem deduplicação.
- **Só cron com e-mail local:** exige configurar envio de e-mail no servidor e não avisa quando o backup simplesmente não roda.
- **Backup do volume do Docker (arquivos do PostgreSQL):** precisa parar o banco ou usar ferramentas de backup físico (pgBackRest), mais complexas do que o volume de dados atual pede.

## Consequências
- Os backups são criptografados no servidor antes de sair; sem a senha do restic, ninguém restaura (nem o Davi). O playbook explica o que fazer se ela se perder.
- A deduplicação do restic mantém o uso do R2 baixo, longe dos 10 GB gratuitos.
- Depende de um serviço externo gratuito (Healthchecks.io) para o alerta. Ele é open source (BSD-3) e pode ser hospedado no servidor de um cliente, se preciso.
- A restauração mensal continua manual (procedimento no playbook).
