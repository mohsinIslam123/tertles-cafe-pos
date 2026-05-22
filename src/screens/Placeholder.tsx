export default function Placeholder({ name }: { name: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 pb-24">
      <span className="text-4xl">🚧</span>
      <p className="text-base font-semibold text-gray-700">{name}</p>
      <p className="text-sm text-gray-400">Coming in a future phase</p>
    </div>
  );
}
