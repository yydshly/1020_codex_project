// SPDX-License-Identifier: GPL-3.0-only
// A selection-version guard, not network cancellation. Commit callbacks are synchronous.
export function createLatestTask() {
  let version = 0, destroyed = false;
  async function run(loader, onCommit, onError = () => {}) {
    if (destroyed) throw new Error('任务入口已销毁');
    if ([loader, onCommit, onError].some(fn => typeof fn !== 'function')) throw new TypeError('任务需要函数');
    const token = ++version;
    try {
      const value = await loader();
      if (destroyed || token !== version) return {status:'stale'};
      onCommit(value);
      return {status:'committed', value};
    } catch (error) {
      if (destroyed || token !== version) return {status:'stale'};
      onError(error);
      return {status:'error', error};
    }
  }
  function invalidate() { version++; }
  function destroy() { destroyed = true; invalidate(); }
  return Object.freeze({run, invalidate, destroy});
}
