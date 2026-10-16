// Dipanggil sekali bila server Next.js bermula — mulakan jadual cron dalaman.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
