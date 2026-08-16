// Embed bootstrap: docked dev suite on the left, chat floating above.
// main.js calls this instead of mounting the overlay panel when TF_EMBED.

import { mountDevSuiteDocked } from '../dev/panel.js';
import { mountChat } from './chat.js';
import { PACKS } from './packs.gen.js';

export function bootEmbed(ctx) {
  const devHost = document.getElementById('tf-dev');
  const chatRoot = document.getElementById('tf-chat-root');
  if (!devHost || !chatRoot) {
    console.warn('[embed] shell hosts missing; embed boot aborted');
    return;
  }
  const dock = mountDevSuiteDocked(ctx, devHost);
  mountChat({ root: chatRoot, ctx, packs: PACKS, dock });
}
