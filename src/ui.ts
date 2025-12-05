import yaml from 'js-yaml';

interface TextNode {
  id: string;
  text: string;
  layerName: string;
  suggestedKey: string;
}

interface Settings {
  token: string;
  repo: string;
  branch: string;
  translationsFolder: string;
  translationsFilename: string;
  languages: string;
}

let textNodes: TextNode[] = [];
let languages = ['en_US', 'de_DE', 'fr_FR'];
let settings: Settings = {
  token: '',
  repo: '',
  branch: 'main',
  translationsFolder: 'src',
  translationsFilename: 'translations.yaml',
  languages: 'en_US,de_DE,fr_FR'
};

// Store all existing translations from GitHub
// Structure: { key: { en_US: "value", de_DE: "value" } }
let existingKeys: Record<string, Record<string, string>> = {};
let keysLoaded = false;

// DOM helpers
function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function setStatus(message: string, type = 'info') {
  const status = $('status');
  if (status) {
    status.textContent = message;
    status.className = 'status ' + type;
  }
}

function addDebug(message: string) {
  const panel = $('debug-panel');
  if (panel) {
    panel.style.display = 'block';
    panel.textContent += message + '\n';
    panel.scrollTop = panel.scrollHeight;
  }
}

function clearDebug() {
  const panel = $('debug-panel');
  if (panel) {
    panel.textContent = '';
    panel.style.display = 'none';
  }
}

// Apply settings to UI
function applySettingsToUI() {
  const tokenEl = $('github-token') as HTMLInputElement;
  const repoEl = $('github-repo') as HTMLInputElement;
  const branchEl = $('github-branch') as HTMLInputElement;
  const folderEl = $('translations-folder') as HTMLInputElement;
  const filenameEl = $('translations-filename') as HTMLInputElement;
  const languagesEl = $('languages') as HTMLInputElement;

  if (tokenEl) tokenEl.value = settings.token || '';
  if (repoEl) repoEl.value = settings.repo || '';
  if (branchEl) branchEl.value = settings.branch || 'main';
  if (folderEl) folderEl.value = settings.translationsFolder || 'src';
  if (filenameEl) filenameEl.value = settings.translationsFilename || 'translations.yaml';
  if (languagesEl) languagesEl.value = settings.languages || 'en_US,de_DE,fr_FR';
  languages = settings.languages.split(',').map(l => l.trim()).filter(l => l);
}

function saveSettings() {
  settings.token = ($('github-token') as HTMLInputElement)?.value || '';
  settings.repo = ($('github-repo') as HTMLInputElement)?.value || '';
  settings.branch = ($('github-branch') as HTMLInputElement)?.value || 'main';
  settings.translationsFolder = ($('translations-folder') as HTMLInputElement)?.value || 'src';
  settings.translationsFilename = ($('translations-filename') as HTMLInputElement)?.value || 'translations.yaml';
  settings.languages = ($('languages') as HTMLInputElement)?.value || 'en_US,de_DE,fr_FR';
  languages = settings.languages.split(',').map(l => l.trim()).filter(l => l);

  // Save via Figma's clientStorage (through main.ts)
  parent.postMessage({ pluginMessage: { type: 'save-settings', settings: settings } }, '*');

  setStatus('Settings saved!', 'success');
  // Reset loaded keys when settings change
  existingKeys = {};
  keysLoaded = false;
  updateKeysStatus();
  renderTextList();
}

function toggleSettings() {
  $('settings-panel')?.classList.toggle('visible');
}

function updateKeysStatus() {
  const statusEl = $('keys-status');
  const keyCount = Object.keys(existingKeys).length;
  if (!statusEl) return;

  if (keysLoaded && keyCount > 0) {
    statusEl.textContent = `${keyCount} keys loaded`;
    statusEl.className = 'keys-status loaded';
  } else if (keysLoaded) {
    statusEl.textContent = 'No existing keys found';
    statusEl.className = 'keys-status';
  } else {
    statusEl.textContent = 'No keys loaded';
    statusEl.className = 'keys-status';
  }
}

// Decode base64 with proper UTF-8 support
function decodeBase64UTF8(base64: string): string {
  const cleanBase64 = base64.replace(/[\n\r]/g, '');
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

// Encode string to base64 with proper UTF-8 support
function encodeBase64UTF8(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Parse YAML using js-yaml
function parseYaml(content: string): Record<string, string> {
  if (!content) return {};
  try {
    const parsed = yaml.load(content);
    if (typeof parsed === 'object' && parsed !== null) {
      // Convert all values to strings
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        result[key] = String(value);
      }
      return result;
    }
    return {};
  } catch (e) {
    addDebug(`YAML parse error: ${e}`);
    return {};
  }
}

// Generate YAML using js-yaml
function toYaml(obj: Record<string, string>): string {
  // Sort keys for consistent output
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return yaml.dump(sorted, {
    lineWidth: -1,  // Don't wrap lines
    quotingType: '"',
    forceQuotes: false
  });
}

async function fetchExistingKeys() {
  if (!settings.token || !settings.repo) {
    setStatus('Please configure GitHub settings first', 'error');
    toggleSettings();
    return;
  }

  const btn = $('fetch-keys-btn') as HTMLButtonElement;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="loading loading-dark"></span> Loading...';
  }
  clearDebug();

  try {
    const [owner, repo] = settings.repo.split('/');
    const apiBase = 'https://api.github.com';
    const folder = settings.translationsFolder;
    const filename = settings.translationsFilename || 'translations.yaml';

    addDebug(`Settings:`);
    addDebug(`  Repo: ${owner}/${repo}`);
    addDebug(`  Branch: ${settings.branch}`);
    addDebug(`  Folder: ${folder}`);
    addDebug(`  Languages: ${languages.join(', ')}`);
    addDebug(`  Filename: ${filename}`);

    existingKeys = {};

    for (const lang of languages) {
      const filePath = `${folder}/${lang}/${filename}`;
      setStatus(`Loading ${filePath}...`, 'info');

      try {
        const url = `${apiBase}/repos/${owner}/${repo}/contents/${filePath}?ref=${settings.branch}`;
        addDebug(`Fetching: ${url}`);

        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${settings.token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        addDebug(`Response: ${res.status} ${res.statusText}`);

        if (res.ok) {
          const data = await res.json();
          const content = decodeBase64UTF8(data.content);
          const translations = parseYaml(content);
          addDebug(`Loaded ${Object.keys(translations).length} keys from ${lang}`);

          for (const [key, value] of Object.entries(translations)) {
            if (!existingKeys[key]) {
              existingKeys[key] = {};
            }
            existingKeys[key][lang] = value;
          }
        } else if (res.status === 404) {
          addDebug(`File not found: ${filePath}`);
        } else {
          const errData = await res.json().catch(() => ({}));
          addDebug(`ERROR: ${res.status} - ${errData.message || res.statusText}`);
        }
      } catch (e) {
        addDebug(`NETWORK ERROR: ${(e as Error).message}`);
      }
    }

    keysLoaded = true;
    updateKeysStatus();
    setStatus(`Loaded ${Object.keys(existingKeys).length} existing keys`, 'success');
    renderTextList();

  } catch (error) {
    setStatus('Error loading keys: ' + (error as Error).message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Load existing keys';
    }
  }
}

function searchKeys(query: string, nodeIndex: number) {
  if (!query || query.length < 1 || !keysLoaded) {
    hideDropdown(nodeIndex);
    return;
  }

  const dropdown = $(`dropdown-${nodeIndex}`);
  if (!dropdown) return;

  const lowerQuery = query.toLowerCase();
  const results: Array<{ key: string; translations: Record<string, string>; matchedIn: string[] }> = [];

  for (const [key, translations] of Object.entries(existingKeys)) {
    const matchedIn: string[] = [];

    if (key.toLowerCase().includes(lowerQuery)) {
      matchedIn.push('key');
    }

    for (const [lang, value] of Object.entries(translations)) {
      if (value.toLowerCase().includes(lowerQuery)) {
        matchedIn.push(lang);
      }
    }

    if (matchedIn.length > 0) {
      results.push({ key, translations, matchedIn });
    }
  }

  const limitedResults = results.slice(0, 10);

  if (limitedResults.length === 0) {
    dropdown.innerHTML = '<div class="search-result" style="color: #999; cursor: default;">No matching keys found</div>';
  } else {
    dropdown.innerHTML = limitedResults.map(r => {
      const previews = languages.map(lang => {
        const val = r.translations[lang] || '';
        const isMatch = r.matchedIn.includes(lang);
        const truncated = val.length > 25 ? val.slice(0, 25) + '...' : val;
        return `<span class="search-result-lang ${isMatch ? 'search-result-match' : ''}">${lang}</span>${escapeHtml(truncated)}`;
      }).join(' ');

      return `
        <div class="search-result" onclick="window.uiSelectKey(${nodeIndex}, '${escapeHtml(r.key).replace(/'/g, "\\'")}')">
          <div class="search-result-key ${r.matchedIn.includes('key') ? 'search-result-match' : ''}">${escapeHtml(r.key)}</div>
          <div class="search-result-preview">${previews}</div>
        </div>
      `;
    }).join('');
  }

  dropdown.classList.add('visible');
}

function selectKey(nodeIndex: number, key: string) {
  const keyInput = $(`key-${nodeIndex}`) as HTMLInputElement;
  if (keyInput) {
    keyInput.value = key;
  }

  const translations = existingKeys[key] || {};
  languages.forEach(lang => {
    const textarea = $(`trans-${nodeIndex}-${lang}`) as HTMLTextAreaElement;
    if (textarea && translations[lang]) {
      textarea.value = translations[lang];
    }
  });

  hideDropdown(nodeIndex);
}

function hideDropdown(nodeIndex: number) {
  const dropdown = $(`dropdown-${nodeIndex}`);
  if (dropdown) {
    dropdown.classList.remove('visible');
  }
}

function hideAllDropdowns() {
  document.querySelectorAll('.search-dropdown').forEach(d => d.classList.remove('visible'));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTextList() {
  const container = $('text-list');
  const pushBtn = $('push-btn') as HTMLButtonElement;

  if (!container) return;

  if (textNodes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 6h16M4 12h16M4 18h10"/>
        </svg>
        <div>No text elements selected</div>
        <div style="margin-top: 4px; font-size: 11px;">Select frames or text layers in Figma</div>
      </div>
    `;
    if (pushBtn) pushBtn.disabled = true;
    return;
  }

  const html = textNodes.map((node, i) => `
    <div class="text-item" data-id="${node.id}">
      <div class="key-row">
        <label>Key</label>
        <div class="key-input-wrapper">
          <input type="text"
                 id="key-${i}"
                 value="${escapeHtml(node.suggestedKey)}"
                 placeholder="${keysLoaded ? 'Type to search existing keys...' : 'translation.key'}"
                 oninput="window.uiSearchKeys(this.value, ${i})"
                 onfocus="window.uiSearchKeys(this.value, ${i})"
                 autocomplete="off" />
          <div id="dropdown-${i}" class="search-dropdown"></div>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(${languages.length}, 1fr); gap: 6px;">
        ${languages.map(lang => `
          <div>
            <label style="font-size: 10px; color: #999; margin-bottom: 2px; display: block;">${lang.toUpperCase()}</label>
            <textarea
              id="trans-${i}-${lang}"
              rows="2"
              placeholder="${lang === languages[0] ? escapeHtml(node.text) : 'Translation...'}"
            >${lang === languages[0] ? escapeHtml(node.text) : ''}</textarea>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  container.innerHTML = html;
  if (pushBtn) pushBtn.disabled = false;
  setStatus(`${textNodes.length} text element(s) found${keysLoaded ? ' - type in key field to search' : ''}`, 'info');
}

function refreshSelection() {
  parent.postMessage({ pluginMessage: { type: 'get-selection' } }, '*');
}

async function pushToGitHub() {
  if (!settings.token || !settings.repo) {
    setStatus('Please configure GitHub settings first', 'error');
    toggleSettings();
    return;
  }

  const translationsByLang: Record<string, Record<string, string>> = {};
  languages.forEach(lang => {
    translationsByLang[lang] = {};
  });

  textNodes.forEach((node, i) => {
    const keyInput = $('key-' + i) as HTMLInputElement;
    const key = keyInput ? keyInput.value.trim() : node.suggestedKey;

    if (key) {
      languages.forEach(lang => {
        const textarea = $(`trans-${i}-${lang}`) as HTMLTextAreaElement;
        const value = textarea ? textarea.value.trim() : '';
        if (value) {
          translationsByLang[lang][key] = value;
        }
      });
    }
  });

  const totalKeys = Object.values(translationsByLang).reduce((sum, obj) => sum + Object.keys(obj).length, 0);
  if (totalKeys === 0) {
    setStatus('No translations to push', 'error');
    return;
  }

  const pushBtn = $('push-btn') as HTMLButtonElement;
  if (pushBtn) {
    pushBtn.disabled = true;
    pushBtn.innerHTML = '<span class="loading"></span> Pushing...';
  }

  try {
    const [owner, repo] = settings.repo.split('/');
    const apiBase = 'https://api.github.com';
    const folder = settings.translationsFolder;
    const filename = settings.translationsFilename || 'translations.yaml';

    for (const lang of languages) {
      const translations = translationsByLang[lang];
      if (Object.keys(translations).length === 0) continue;

      const filePath = `${folder}/${lang}/${filename}`;
      setStatus(`Pushing ${lang}/${filename}...`, 'info');

      let existingContent = '';
      let sha: string | null = null;

      try {
        const getRes = await fetch(
          `${apiBase}/repos/${owner}/${repo}/contents/${filePath}?ref=${settings.branch}`,
          {
            headers: {
              'Authorization': `Bearer ${settings.token}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          }
        );

        if (getRes.ok) {
          const data = await getRes.json();
          existingContent = decodeBase64UTF8(data.content);
          sha = data.sha;
        }
      } catch (e) {
        // File doesn't exist yet
      }

      const existingTranslations = parseYaml(existingContent);
      const merged = { ...existingTranslations, ...translations };
      const newContent = toYaml(merged);

      const putRes = await fetch(
        `${apiBase}/repos/${owner}/${repo}/contents/${filePath}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${settings.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `Update ${lang} translations from Figma (${Object.keys(translations).length} keys)`,
            content: encodeBase64UTF8(newContent),
            branch: settings.branch,
            ...(sha ? { sha } : {})
          })
        }
      );

      if (!putRes.ok) {
        const err = await putRes.json();
        throw new Error(`${lang}: ${err.message || 'Failed to push'}`);
      }
    }

    // Update local cache
    textNodes.forEach((node, i) => {
      const keyInput = $('key-' + i) as HTMLInputElement;
      const key = keyInput ? keyInput.value.trim() : '';
      if (key) {
        if (!existingKeys[key]) existingKeys[key] = {};
        languages.forEach(lang => {
          const textarea = $(`trans-${i}-${lang}`) as HTMLTextAreaElement;
          const value = textarea ? textarea.value.trim() : '';
          if (value) {
            existingKeys[key][lang] = value;
          }
        });
      }
    });
    updateKeysStatus();

    setStatus(`✓ Pushed translations to GitHub!`, 'success');
    parent.postMessage({ pluginMessage: { type: 'notify', message: 'Translations pushed to GitHub!' } }, '*');

  } catch (error) {
    setStatus('Error: ' + (error as Error).message, 'error');
  } finally {
    if (pushBtn) {
      pushBtn.disabled = false;
      pushBtn.innerHTML = 'Push to GitHub';
    }
  }
}

// Handle messages from plugin
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  if (msg.type === 'selection-result' || msg.type === 'selection-changed') {
    textNodes = msg.nodes || [];
    renderTextList();
  }

  if (msg.type === 'settings-loaded' && msg.settings) {
    settings = { ...settings, ...msg.settings };
    applySettingsToUI();
  }

  if (msg.type === 'settings-saved') {
    if (msg.success) {
      setStatus('Settings saved!', 'success');
    } else {
      setStatus('Failed to save settings', 'error');
    }
  }
};

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('.key-input-wrapper')) {
    hideAllDropdowns();
  }
});

// Expose functions to window for inline handlers
declare global {
  interface Window {
    uiSaveSettings: typeof saveSettings;
    uiToggleSettings: typeof toggleSettings;
    uiFetchExistingKeys: typeof fetchExistingKeys;
    uiPushToGitHub: typeof pushToGitHub;
    uiRefreshSelection: typeof refreshSelection;
    uiSearchKeys: typeof searchKeys;
    uiSelectKey: typeof selectKey;
  }
}

window.uiSaveSettings = saveSettings;
window.uiToggleSettings = toggleSettings;
window.uiFetchExistingKeys = fetchExistingKeys;
window.uiPushToGitHub = pushToGitHub;
window.uiRefreshSelection = refreshSelection;
window.uiSearchKeys = searchKeys;
window.uiSelectKey = selectKey;

// Initialize
applySettingsToUI();
