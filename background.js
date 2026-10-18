// Wakes sleeping (discarded or never-loaded) tabs so they report a real title.
// There is no "undiscard" API: a tab only loads when it is activated, so we
// switch to each sleeping tab in turn and then switch back. This runs here
// rather than in the popup because on Android the popup closes as soon as the
// active tab changes.

const LOAD_TIMEOUT_MS = 10_000;

let wake = { running: false, done: 0, total: 0 };

function isSleeping(t) {
  return t.discarded || !t.title || t.title === t.url;
}

function notify() {
  // Nobody may be listening (the popup is closed); that is fine.
  browser.runtime.sendMessage({ type: 'wake-progress', ...wake }).catch(() => {});
}

function waitForLoad(tabId) {
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    const onUpdated = (id, change) => {
      if (id === tabId && change.status === 'complete') finish();
    };
    const timer = setTimeout(finish, LOAD_TIMEOUT_MS);
    browser.tabs.onUpdated.addListener(onUpdated);
  });
}

async function wakeAll() {
  wake = { running: true, done: 0, total: 0 };
  let active = [];

  try {
    const all = await browser.tabs.query({});
    const sleeping = all.filter(isSleeping);
    active = all.filter(t => t.active);
    wake.total = sleeping.length;
    notify();

    for (const t of sleeping) {
      try {
        const loaded = waitForLoad(t.id);
        await browser.tabs.update(t.id, { active: true });
        await loaded;
      } catch (e) {
        console.warn(`TabExporter: could not wake tab ${t.id}: ${e.message}`);
      }
      wake.done++;
      notify();
    }
  } finally {
    for (const t of active) {
      await browser.tabs.update(t.id, { active: true }).catch(() => {});
    }
    wake.running = false;
    notify();
  }
}

browser.runtime.onMessage.addListener(msg => {
  if (msg.type === 'wake-start') {
    if (!wake.running) wakeAll();
    return Promise.resolve(wake);
  }
  if (msg.type === 'wake-status') return Promise.resolve(wake);
});
