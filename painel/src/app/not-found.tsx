import Link from "next/link";

export default function NaoEncontrada() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
      <h1 className="m-0 text-2xl font-medium tracking-[-0.03em]">Página não encontrada.</h1>
      <Link href="/" className="font-medium underline-offset-2 hover:underline">
        Voltar para o início
      </Link>
    </main>
  );
}
