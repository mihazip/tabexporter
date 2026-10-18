const $ = id => document.getElementById(id);

const FORMATS = {
  txt: {
    ext: 'txt',
    mime: 'text/plain',
    render: tabs => tabs.map(t => `${t.title} | ${t.url}`).join('\n') + '\n',
  },
  md: {
    ext: 'md',
    mime: 'text/markdown',
    render: tabs => tabs
      .map(t => `- [${t.title.replace(/([\[\]])/g, '\\$1')}](${t.url.replace(/\)/g, '%29')})`)
      .join('\n') + '\n',
  },
  csv: {
    ext: 'csv',
    mime: 'text/csv',
    render: tabs => ['title,url', ...tabs.map(t => `${csvField(t.title)},${csvField(t.url)}`)]
      .join('\r\n') + '\r\n',
  },
};

function csvField(s) {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

let tabs = [];

function selectedFormat() {
  return FORMATS[document.querySelector('input[name="format"]:checked').value];
}

function exportText() {
  return selectedFormat().render(tabs);
}

function filename() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `tabs_${stamp}.${selectedFormat().ext}`;
}

function setStatus(text, kind = '') {
  const el = $('status');
  el.textContent = text;
  el.className = kind;
}

async function saveFile() {
  const fmt = selectedFormat();
  const blob = new Blob([exportText()], { type: `${fmt.mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const name = filename();

  // Desktop Firefox has the downloads API; Firefox for Android dropped it in
  // version 79, so there we hand the blob to the browser's own download
  // handling through an <a download> link instead.
  if (browser.downloads) {
    await browser.downloads.download({ url, filename: name, saveAs: false });
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // The browser reads the blob asynchronously, so keep it alive for a while.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  setStatus(`Download started: ${name}. It goes to your Downloads folder.`, 'ok');
}

async function share() {
  await navigator.share({ title: 'Open tabs', text: exportText() });
  setStatus('Shared.', 'ok');
}

async function copy() {
  await navigator.clipboard.writeText(exportText());
  setStatus(`Copied ${tabs.length} tabs to the clipboard.`, 'ok');
}

function bind(id, action) {
  $(id).addEventListener('click', async () => {
    try {
      await action();
    } catch (e) {
      if (e.name === 'AbortError') return; // user dismissed the share sheet
      setStatus(`Error: ${e.message}`, 'err');
    }
  });
}

function renderList() {
  $('count').textContent = tabs.length;
  $('count-label').textContent = tabs.length === 1 ? 'open tab' : 'open tabs';

  const list = $('list');
  list.replaceChildren(...tabs.map(t => {
    const li = document.createElement('li');
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = t.title || t.url;
    const url = document.createElement('span');
    url.className = 'url';
    url.textContent = t.url;
    li.append(title, url);
    return li;
  }));
}

// Same test as background.js: a tab without a real title has not loaded yet.
function isSleeping(t) {
  return t.discarded || !t.title || t.title === t.url;
}

function renderWake(raw, wake) {
  const sleeping = raw.filter(isSleeping).length;
  const discarded = raw.filter(t => t.discarded).length;
  $('wake-box').hidden = !sleeping && !wake.running;
  $('wake').disabled = wake.running;
  $('sleeping').textContent = wake.running
    ? `Waking tabs: ${wake.done} of ${wake.total}…`
    : `${sleeping} ${sleeping === 1 ? 'tab is' : 'tabs are'} asleep `
      + `(${discarded} unloaded, ${sleeping - discarded} without a title).`;
}

async function loadTabs() {
  const raw = await browser.tabs.query({});
  tabs = raw.map(t => ({ title: t.title || '', url: t.url || '' }));
  renderList();
  const wake = await browser.runtime.sendMessage({ type: 'wake-status' })
    .catch(() => ({ running: false }));
  renderWake(raw, wake);
}

async function wakeTabs() {
  await browser.runtime.sendMessage({ type: 'wake-start' });
  setStatus('Waking tabs. Firefox will switch through them, then come back here.');
}

async function init() {
  if (navigator.share) $('share').hidden = false;

  bind('save', saveFile);
  bind('share', share);
  bind('copy', copy);
  bind('wake', wakeTabs);

  // Not async: an async listener would answer every message with a promise.
  browser.runtime.onMessage.addListener(msg => {
    if (msg.type !== 'wake-progress') return;
    if (msg.running) {
      browser.tabs.query({}).then(raw => renderWake(raw, msg));
    } else {
      loadTabs().then(() => setStatus('Finished waking tabs.', 'ok'));
    }
  });

  try {
    await loadTabs();
  } catch (e) {
    setStatus(`Could not read tabs: ${e.message}`, 'err');
    for (const b of document.querySelectorAll('button')) b.disabled = true;
  }
}

init();
