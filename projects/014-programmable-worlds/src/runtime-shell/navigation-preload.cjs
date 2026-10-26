'use strict';

// Only fixed host metadata is exposed, never Node or IPC. A real user click on
// a narrow HTTPS anchor whitelist can ask the owning main process to open it.
const { ipcRenderer, contextBridge } = require('electron');
const backendArgument = process.argv.filter(value => value.startsWith('--worlds-host-backend=')).pop();
const backend = backendArgument?.slice('--worlds-host-backend='.length);
if (['gl', 'd3d11', 'vulkan'].includes(backend)) contextBridge.exposeInMainWorld('worldsHost', Object.freeze({ backend, localRenderer: true }));
function userExternalLink(event) {
  if (!event.isTrusted || event.defaultPrevented || (event.button !== 0 && event.button !== 1)) return;
  const anchor = event.target.closest?.('a[href]');
  if (!anchor) return;
  let url;
  try { url = new URL(anchor.href, location.href); } catch { return; }
  if (url.protocol !== 'https:' || !['github.com', 'x.com'].includes(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) return;
  event.preventDefault();
  ipcRenderer.send('worlds-user-external-link', url.href);
}
addEventListener('click', userExternalLink, true);
addEventListener('auxclick', userExternalLink, true);
