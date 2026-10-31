# 0001. Registrar decisões técnicas em ADRs

- Status: Aceito
- Data: 2026-10-31
- Decidido por: Davi

## Contexto
O projeto é desenvolvido por uma pessoa com agentes de IA. Sem registro, o agente e o Davi perdem o motivo das escolhas e repetem discussões.

## Decisão
Toda escolha técnica entre alternativas vira um ADR curto nesta pasta, criado com `/asttra:adr`.

## Alternativas consideradas
- Registrar só no PRD ou TRD: misturaria requisitos com histórico de decisões.
- Não registrar: o agente reabriria decisões já tomadas.

## Consequências
Decisões ficam rastreáveis e o agente as consulta antes de propor mudanças. Custa alguns minutos por decisão.
