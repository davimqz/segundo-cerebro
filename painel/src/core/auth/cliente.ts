"use client";

import { createAuthClient } from "better-auth/react";

// Cliente do navegador. Fala com /api/auth no mesmo endereço do painel.
export const authCliente = createAuthClient();
