import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center px-4">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="text-gray-300">
          Your account is signed in, but it does not have enough permission for this part of Traefik Proxy Admin.
        </p>
        <Link className="inline-flex rounded border border-gray-700 px-4 py-2 hover:bg-gray-900" href="/">
          Back to services
        </Link>
      </div>
    </main>
  );
}
