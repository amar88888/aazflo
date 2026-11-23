// Dipanggil sekali bila server Next.js bermula — apply migration tertangguh
// (lihat runtime-migrate.ts), kemudian mulakan jadual cron dalaman.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { runPendingMigrations } = await import("@/lib/runtime-migrate");
      await runPendingMigrations();
    } catch (e) {
      console.error("[instrumentation] runtime-migrate gagal:", e);
    }
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
