import { NotationInputPrototype } from "@/components/notation-input-prototype";

export default function Home() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(226,232,240,0.92),rgba(248,250,252,0.98)_44%,#ffffff_100%)] p-3 sm:p-4">
      <div className="w-full max-w-6xl">
        <NotationInputPrototype />
      </div>
    </main>
  );
}
