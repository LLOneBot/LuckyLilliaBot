/** One host shutdown path: signals and the parent's death both await plugin disposal. */
export function installHostLifecycle(dispose: () => Promise<void>, log: (error: unknown) => void): () => Promise<void> {
  let stopping: Promise<void> | undefined
  let parentTimer: NodeJS.Timeout | undefined
  const stop = () => stopping ??= (async () => {
    if (parentTimer) clearInterval(parentTimer)
    process.off('SIGINT', requestStop)
    process.off('SIGTERM', requestStop)
    await dispose()
  })()
  const requestStop = () => { void stop().then(() => process.exit(0), error => { log(error); process.exit(1) }) }
  process.once('SIGINT', requestStop)
  process.once('SIGTERM', requestStop)
  const parent = Number(process.env.LL_PARENT_PID)
  if (Number.isSafeInteger(parent) && parent > 0 && parent !== process.pid) {
    parentTimer = setInterval(() => {
      try { process.kill(parent, 0) } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') requestStop()
      }
    }, 1000)
    parentTimer.unref()
  }
  return stop
}
