// Main plugin code - runs in Figma's sandbox
// This file has access to the Figma document but NOT to browser APIs

interface TextNodeInfo {
  id: string;
  text: string;
  layerName: string;
  suggestedKey: string;
}

interface PluginMessage {
  type: string;
  [key: string]: unknown;
}

interface Settings {
  token: string;
  repo: string;
  branch: string;
  translationsFolder: string;
  translationsFilename: string;
  languages: string;
}

const SETTINGS_KEY = "i18n-github-settings";

// Show the UI
figma.showUI(__html__, { width: 450, height: 600 });

// Extract text from selected nodes
function findTextNodes(nodes: readonly SceneNode[]): TextNodeInfo[] {
  const results: TextNodeInfo[] = [];

  function traverse(node: SceneNode) {
    if (node.type === "TEXT") {
      const text = node.characters.trim();
      // Skip empty text, pure numbers, or very short text
      if (text && !/^\d+$/.test(text) && text.length > 0) {
        results.push({
          id: node.id,
          text: text,
          layerName: node.name,
          suggestedKey: generateSuggestedKey(node.name, text),
        });
      }
    }

    // Recurse into children
    if ("children" in node) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return results;
}

// Generate a suggested key from layer name or text content
function generateSuggestedKey(layerName: string, text: string): string {
  // If layer name looks like a key (contains dots or underscores), use it
  if (/^[a-z][a-z0-9._]+$/i.test(layerName) && layerName.length < 50) {
    return layerName.toLowerCase().replace(/\s+/g, "_");
  }

  // Otherwise, generate from text content
  const key = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, "") // Remove special chars
    .trim()
    .replace(/\s+/g, "_") // Spaces to underscores
    .slice(0, 30); // Limit length

  return key || "text";
}

// Load settings from clientStorage and send to UI
async function loadAndSendSettings() {
  try {
    const settings = await figma.clientStorage.getAsync(SETTINGS_KEY);
    figma.ui.postMessage({
      type: "settings-loaded",
      settings: settings || null,
    });
  } catch (e) {
    figma.ui.postMessage({
      type: "settings-loaded",
      settings: null,
    });
  }
}

// Handle messages from UI
figma.ui.onmessage = async (msg: PluginMessage) => {
  if (msg.type === "get-selection") {
    const textNodes = findTextNodes(figma.currentPage.selection);
    figma.ui.postMessage({
      type: "selection-result",
      nodes: textNodes,
      count: textNodes.length,
    });
  }

  if (msg.type === "save-settings") {
    try {
      await figma.clientStorage.setAsync(SETTINGS_KEY, msg.settings as Settings);
      figma.ui.postMessage({ type: "settings-saved", success: true });
    } catch (e) {
      figma.ui.postMessage({ type: "settings-saved", success: false });
    }
  }

  if (msg.type === "load-settings") {
    await loadAndSendSettings();
  }

  if (msg.type === "notify") {
    figma.notify(msg.message as string);
  }

  if (msg.type === "close") {
    figma.closePlugin();
  }
};

// Listen for selection changes
figma.on("selectionchange", () => {
  const textNodes = findTextNodes(figma.currentPage.selection);
  figma.ui.postMessage({
    type: "selection-changed",
    nodes: textNodes,
    count: textNodes.length,
  });
});

// Initial load: send selection and settings
const initialNodes = findTextNodes(figma.currentPage.selection);
figma.ui.postMessage({
  type: "selection-result",
  nodes: initialNodes,
  count: initialNodes.length,
});

// Load and send saved settings
loadAndSendSettings();
