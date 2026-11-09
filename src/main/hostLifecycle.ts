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
  // The first --parent-pid wins, whether passed as --parent-pid=<pid> or --parent-pid <pid>.
  const parentIndex = process.argv.findIndex(arg => arg === '--parent-pid' || arg.startsWith('--parent-pid='))
  const parentArg = process.argv[parentIndex]
  const parentValue = parentArg === '--parent-pid' ? process.argv[parentIndex + 1] : parentArg?.slice('--parent-pid='.length)
  const parent = parentValue && /^\d+$/.test(parentValue) ? Number(parentValue) : NaN
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
