import { ClipperStudio } from "@/components/clipper-studio";
import { isWorkerConfigured } from "@/lib/env";
import { fetchWorkerHealth } from "@/lib/worker-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const workerConfigured = isWorkerConfigured();
  const workerHealth = workerConfigured ? await fetchWorkerHealth() : null;

  return (
    <main className="shell">
      <ClipperStudio
        workerConfigured={workerConfigured}
        workerHealth={workerHealth}
      />
    </main>
  );
}
