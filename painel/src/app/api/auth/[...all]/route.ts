import { auth } from "@/core/auth/auth";

// Rotas do Better Auth (/api/auth/*). A instância é criada no primeiro pedido, não no build.
export function GET(request: Request) {
  return auth().handler(request);
}

export function POST(request: Request) {
  return auth().handler(request);
}
