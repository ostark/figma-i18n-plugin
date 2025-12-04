"use strict";
(() => {
  // src/main.ts
  figma.showUI(__html__, { width: 450, height: 600 });
  function findTextNodes(nodes) {
    const results = [];
    function traverse(node) {
      if (node.type === "TEXT") {
        const text = node.characters.trim();
        if (text && !/^\d+$/.test(text) && text.length > 0) {
          results.push({
            id: node.id,
            text,
            layerName: node.name,
            suggestedKey: generateSuggestedKey(node.name, text)
          });
        }
      }
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
  function generateSuggestedKey(layerName, text) {
    if (/^[a-z][a-z0-9._]+$/i.test(layerName) && layerName.length < 50) {
      return layerName.toLowerCase().replace(/\s+/g, "_");
    }
    const key = text.toLowerCase().replace(/[^a-z0-9\s]/gi, "").trim().replace(/\s+/g, "_").slice(0, 30);
    return key || "text";
  }
  figma.ui.onmessage = (msg) => {
    if (msg.type === "get-selection") {
      const textNodes = findTextNodes(figma.currentPage.selection);
      figma.ui.postMessage({
        type: "selection-result",
        nodes: textNodes,
        count: textNodes.length
      });
    }
    if (msg.type === "notify") {
      figma.notify(msg.message);
    }
    if (msg.type === "close") {
      figma.closePlugin();
    }
  };
  figma.on("selectionchange", () => {
    const textNodes = findTextNodes(figma.currentPage.selection);
    figma.ui.postMessage({
      type: "selection-changed",
      nodes: textNodes,
      count: textNodes.length
    });
  });
  var initialNodes = findTextNodes(figma.currentPage.selection);
  figma.ui.postMessage({
    type: "selection-result",
    nodes: initialNodes,
    count: initialNodes.length
  });
})();
